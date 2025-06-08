import { Worker } from 'bullmq';
import OpenAI from 'openai';
import { eq, and, desc, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { messages, kgNodes, kgEdges, msgToNode, type Message } from '../db/schema.js';
import { redisConnection, type MessageJobData } from '../lib/queue.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Prompt templates from our validated tests
const SENTIMENT_PROMPT = `You are a sentiment analyzer. Given a conversation and a target message, return only an integer from –5 (very negative) to +5 (very positive) representing the target message's sentiment.

Examples:
Conversation:
User: I'm so excited about this new project!
Assistant: That's great!
Target Message: "This is the best day ever!"
Sentiment: 5

Conversation:
User: I got stuck in traffic.
Assistant: That's frustrating.
Target Message: "I feel completely drained."
Sentiment: -4

Conversation:
User: What time is the meeting tomorrow?
Assistant: It's at 10am.
Target Message: "Thanks for letting me know."
Sentiment: 0`;

const HELPFULNESS_PROMPT = `You are a helpfulness evaluator. Given a conversation and a target message, rate how helpful the target message will be later (0.0–1.0). Return only a decimal.

Examples:
Conversation:
User: How do I reset my password?
Assistant: Go to Settings > Account > Reset Password.
Target Message: "I've sent the reset link; follow it to reset."
Helpfulness: 1.0

Conversation:
User: What's the weather today?
Assistant: I'm not sure.
Target Message: "Hello!"
Helpfulness: 0.0

Conversation:
User: I need a summary of our last meeting.
Assistant: Here's a summary...
Target Message: "Let me know if any part is unclear."
Helpfulness: 0.6`;

const EXCITEMENT_PROMPT = `You are an excitement rater. Given a single message, return only a decimal 0.0–1.0 indicating how exciting it is.

Examples:
Message: "The sky is blue today."
Excitement: 0.1

Message: "Our startup just closed a $100M round!"
Excitement: 0.9

Message: "I made coffee."
Excitement: 0.0`;

const TRIPLE_EXTRACTION_PROMPT = `You are a fact extractor. Extract up to three factual triples from one message. Return JSON array [{"s":"", "p":"", "o":""}] or [] if none.

Examples:
Message: "Alice works at ACME Corp."
Output: [{"s":"Alice","p":"works_at","o":"ACME Corp"}]

Message: "Bob and Carol founded StartupX in 2023."
Output: [{"s":"Bob","p":"founded","o":"StartupX"},{"s":"Carol","p":"founded","o":"StartupX"}]

Message: "Project Beta deadline is 2025-12-01."
Output: [{"s":"Project Beta","p":"deadline","o":"2025-12-01"}]

Message: "I love traveling."
Output: []

Message: "The stock price of XYZ is $150."
Output: [{"s":"XYZ","p":"stock_price","o":"$150"}]`;

// Job A Worker: Process message metrics and KG
export const jobAWorker = new Worker('message-metrics', async (job) => {
  const { msg_id, user_id, thread_id, content } = job.data as MessageJobData;
  
  console.log(`🔄 Processing message ${msg_id} for user ${user_id}`);
  
  try {
    // Step 1: Generate embedding first (if not already done)
    let messageEmb: number[] | null = null;
    const existingMessage = await db.select().from(messages).where(eq(messages.msg_id, msg_id)).limit(1);
    
    if (!existingMessage[0]?.emb) {
      console.log(`📊 Generating embedding for message ${msg_id}`);
      const embResponse = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: content,
      });
      messageEmb = embResponse.data[0].embedding;
      
      // Update message with embedding (store as array)
      await db.update(messages)
        .set({ 
          emb: messageEmb,
          embed_ready: true 
        })
        .where(eq(messages.msg_id, msg_id));
    } else {
      // Parse vector if stored as string
      messageEmb = Array.isArray(existingMessage[0].emb) 
        ? existingMessage[0].emb 
        : JSON.parse(existingMessage[0].emb as string);
    }
    
    // Step 2: Get full conversation context for sentiment/helpfulness
    const threadMessages = await db.select()
      .from(messages)
      .where(eq(messages.thread_id, thread_id))
      .orderBy(messages.created_at);
    
    const conversationContext = threadMessages
      .map((msg: Message) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');
    
    // Step 3: Parallel OpenAI calls for metrics
    const [sentimentResult, helpfulnessResult, excitementResult, triplesResult] = await Promise.all([
      // Sentiment with full context
      openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: SENTIMENT_PROMPT },
          { role: 'user', content: `Conversation:\n${conversationContext}\nTarget Message: "${content}"\nSentiment:` }
        ],
        temperature: 0.1,
        max_tokens: 10
      }),
      
      // Helpfulness with full context
      openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: HELPFULNESS_PROMPT },
          { role: 'user', content: `Conversation:\n${conversationContext}\nTarget Message: "${content}"\nHelpfulness:` }
        ],
        temperature: 0.1,
        max_tokens: 10
      }),
      
      // Excitement (message only)
      openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: EXCITEMENT_PROMPT },
          { role: 'user', content: `Message: "${content}"\nExcitement:` }
        ],
        temperature: 0.1,
        max_tokens: 10
      }),
      
      // Triple extraction (message only)
      openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: TRIPLE_EXTRACTION_PROMPT },
          { role: 'user', content: `Message: "${content}"\nOutput:` }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    ]);
    
    // Parse results
    const sentiment = parseInt(sentimentResult.choices[0].message.content?.trim() || '0');
    const helpfulness = parseFloat(helpfulnessResult.choices[0].message.content?.trim() || '0');
    const excitement = parseFloat(excitementResult.choices[0].message.content?.trim() || '0');
    
    let triples: Array<{s: string, p: string, o: string}> = [];
    try {
      const triplesText = triplesResult.choices[0].message.content?.trim() || '[]';
      triples = JSON.parse(triplesText);
    } catch (error) {
      console.warn(`Failed to parse triples for message ${msg_id}:`, error);
      triples = [];
    }
    
    // Step 4: Calculate novelty (requires embedding)
    let novelty = 0;
    if (messageEmb) {
      try {
        const result = await db.execute(sql`
          SELECT 1 - MAX(emb <=> ${messageEmb}::vector) as max_similarity
          FROM messages 
          WHERE user_id = ${user_id} AND msg_id != ${msg_id} AND emb IS NOT NULL
          ORDER BY emb <=> ${messageEmb}::vector
          LIMIT 500
        `);
        
        novelty = (result as any)[0]?.max_similarity || 1.0;
      } catch (error) {
        console.warn(`Failed to calculate novelty for message ${msg_id}:`, error);
        novelty = 1.0; // Default to max novelty on error
      }
    }
    
    // Step 5: Knowledge Graph Processing
    const processedNodes: number[] = [];
    
    for (const triple of triples) {
      // Process subject and object
      for (const entity of [triple.s, triple.o]) {
        const canonicalLabel = entity.toLowerCase().trim();
        
        // Check if node exists for this user
        let existingNode = await db.select()
          .from(kgNodes)
          .where(and(eq(kgNodes.user_id, user_id), eq(kgNodes.label, canonicalLabel)))
          .limit(1);
        
        let nodeId: number;
        
        if (existingNode.length === 0) {
          // Create new node with embedding
          const labelEmbResponse = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: canonicalLabel,
          });
          
          const [newNode] = await db.insert(kgNodes)
            .values({
              user_id: user_id,
              label: canonicalLabel,
              emb: labelEmbResponse.data[0].embedding,
              degree: 0
            })
            .returning({ node_id: kgNodes.node_id });
          
          nodeId = newNode.node_id;
        } else {
          nodeId = existingNode[0].node_id;
        }
        
        processedNodes.push(nodeId);
      }
      
      // Create edge if we have both subject and object
      if (triples.length > 0) {
        const subjectNode = await db.select()
          .from(kgNodes)
          .where(and(eq(kgNodes.user_id, user_id), eq(kgNodes.label, triple.s.toLowerCase().trim())))
          .limit(1);
        
        const objectNode = await db.select()
          .from(kgNodes)
          .where(and(eq(kgNodes.user_id, user_id), eq(kgNodes.label, triple.o.toLowerCase().trim())))
          .limit(1);
        
        if (subjectNode.length > 0 && objectNode.length > 0) {
          // Insert or increment edge weight
          await db.insert(kgEdges)
            .values({
              user_id,
              subject_id: subjectNode[0].node_id,
              relation: triple.p,
              object_id: objectNode[0].node_id,
              weight: 1
            })
            .onConflictDoUpdate({
              target: [kgEdges.user_id, kgEdges.subject_id, kgEdges.relation, kgEdges.object_id],
              set: { weight: sql`${kgEdges.weight} + 1` }
            });
          
          // Update node degrees
          await db.update(kgNodes)
            .set({ degree: sql`${kgNodes.degree} + 1` })
            .where(eq(kgNodes.node_id, subjectNode[0].node_id));
          
          await db.update(kgNodes)
            .set({ degree: sql`${kgNodes.degree} + 1` })
            .where(eq(kgNodes.node_id, objectNode[0].node_id));
        }
      }
    }
    
    // Link message to nodes
    for (const nodeId of [...new Set(processedNodes)]) {
      await db.insert(msgToNode)
        .values({ msg_id, node_id: nodeId })
        .onConflictDoNothing();
    }
    
    // Step 6: Calculate centrality (degree-based for now)
    let centrality = 0;
    if (processedNodes.length > 0) {
      const nodesDegrees = await db.select()
        .from(kgNodes)
        .where(and(
          eq(kgNodes.user_id, user_id),
          sql`${kgNodes.node_id} = ANY(${processedNodes})`
        ));
      
      const avgDegree = nodesDegrees.reduce((sum: number, node: any) => sum + (node.degree || 0), 0) / nodesDegrees.length;
      centrality = Math.min(avgDegree / 10, 1.0); // Normalize to 0-1
    }
    
    // Step 7: Calculate priority
    const priority = 0.3 * novelty + 0.3 * excitement + 0.2 * helpfulness + 0.1 * centrality + 0.1 * Math.abs(sentiment);
    
    // Step 8: Update message with all metrics
    await db.update(messages)
      .set({
        sentiment,
        excitement,
        helpfulness,
        novelty,
        centrality,
        priority,
        metrics_ready: true
      })
      .where(eq(messages.msg_id, msg_id));
    
    console.log(`✅ Completed processing message ${msg_id}: sentiment=${sentiment}, excitement=${excitement}, helpfulness=${helpfulness}, novelty=${novelty}, priority=${priority}`);
    
    return { success: true, msg_id, metrics: { sentiment, excitement, helpfulness, novelty, centrality, priority } };
    
  } catch (error) {
    console.error(`❌ Failed to process message ${msg_id}:`, error);
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 2, // Process 2 messages in parallel
});