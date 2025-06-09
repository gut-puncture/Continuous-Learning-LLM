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
const SENTIMENT_PROMPT = `
You are a sentiment analyzer. Given a messy, real-world conversation and a target message (the very last message), return exactly one integer between -5 (very negative) and +5 (very positive) reflecting only that target message's emotional tone. Output only the integer with no extra text.

Scale:
-5 → extremely negative emotions (anger, despair)
-3 to -1 → negative but less intense (sadness, frustration)
0 → neutral or factual statements
1 to 3 → mildly positive or encouraging
5 → extremely positive emotions (joy, excitement)

Examples:

Conversation:
User: "I can't believe my flight got canceled yesterday, and now I'm stranded in a city I don't know."
Assistant: "That's really rough—do you need accommodation recommendations?"
User: "Yes, please."
Assistant: "There's an airport hotel nearby but it's pricey."
Target Message: "I'll try booking a hostel instead; thanks for the tip!"
Sentiment: 1

Conversation:
User: "My laptop battery died in the middle of my presentation, and now I'm panicking."
Assistant: "You can borrow a charger from the reception desk. They usually have spares."
User: "Great idea."
Target Message: "Great idea."
Sentiment: 2

Conversation:
User: "I'm so tired of these delays and bumps in the process."
Assistant: "We apologize for the inconvenience, we're working on it."
User: "Honestly, I'd rather just walk home than wait."
Target Message: "Honestly, I'd rather just walk home than wait."
Sentiment: -2

Conversation:
User: "Our project deadline is next week, and the report is nowhere near done."
Assistant: "We can extend the deadline or add more resources."
User: "Extending is risky, but resources might help."
Target Message: "Let's bring in two more team members to finish it on time."
Sentiment: 0
`;

const HELPFULNESS_PROMPT = `
You are a helpfulness evaluator. Given a messy, real-world conversation thread (with both user and assistant messages) and a target message (the very next assistant response), return exactly one decimal between 0.0 (not helpful at all) and 1.0 (maximally helpful). Do not output any text other than the number.

Guidelines:
0.0 → completely unhelpful or off-topic
0.1–0.3 → trivial acknowledgements or small talk
0.4–0.6 → partial answers or clarifying questions that may require follow-up
0.7–0.9 → mostly helpful but missing minor details or examples
1.0 → clear, complete, and actionable solution to the user's request

Examples:

Conversation:
User: "Hey, I've been trying to log into my bank app but it just shows a blank screen."
Assistant: "What device and OS are you using?"
User: "It's an iPhone 12 running iOS 16, latest app version."
Assistant: "Have you tried force-closing and reopening the app?"
User: "Yes, multiple times, still blank."
Assistant: "Okay."
Target Message: "Try uninstalling the app, then reinstall from the App Store—that usually fixes corrupted installs."
Helpfulness: 1.0

Conversation:
User: "Um, so I'm trying to get my coffee machine to pair with my phone, but the Bluetooth icon just blinks and nothing happens."
Assistant: "Did you enable Bluetooth permissions for the coffee app?"
User: "I think so, but not sure where to check."
Assistant: "Go to Settings > Apps > CoffeeApp > Permissions."
Target Message: "If that doesn't work, reset the machine by holding the power button for 10 seconds, then try pairing again."
Helpfulness: 0.8

Conversation:
User: "Hello?"
Assistant: "Hi there!"
User: "What's the weather?"
Assistant: "It's sunny."
Target Message: "K."
Helpfulness: 0.0

Conversation:
User: "Can you summarize our last call about the marketing budget?"
Assistant: "We covered social ads, email campaigns, and influencer partnerships."
User: "I missed the part about email frequency."
Assistant: "We discussed sending weekly emails."
Target Message: "I'll draft an example schedule and share it by end of day."
Helpfulness: 0.6
`;

const EXCITEMENT_PROMPT = `You are an excitement rater. Given a single message, return only a decimal 0.0–1.0 indicating how exciting it is.

Examples:
Message: "The sky is blue today."
Excitement: 0.1

Message: "Our startup just closed a $100M round!"
Excitement: 0.9

Message: "I made coffee."
Excitement: 0.0`;

const TRIPLE_EXTRACTION_PROMPT = `
You are a fact extractor. From a single, possibly messy human message, extract up to three factual triples (subject, relation, object).
• Use snake_case for relations (e.g., works_at, moved_to).
• Return a JSON array [{"s":"", "p":"", "o":""}].
• If there are more than three plausible triples, choose the three most salient.
• If none, return an empty array [].
• Do not output any extra text.

Examples:

Message: "Hey team, I moved from Denver to Seattle back in 2020 for a consulting gig, and just last month I switched roles to lead product."
Output: [
  {"s":"I","p":"moved_from","o":"Denver"},
  {"s":"I","p":"moved_to","o":"Seattle"},
  {"s":"I","p":"role_change","o":"lead product"}
]

Message: "Our Q1 revenue was $1.2M, Q2 jumped to $1.8M, and Q3 is projected at $2M."
Output: [
  {"s":"our company","p":"q1_revenue","o":"$1.2M"},
  {"s":"our company","p":"q2_revenue","o":"$1.8M"},
  {"s":"our company","p":"q3_projection","o":"$2M"}
]

Message: "Acme Corp released the UltraPhone in November 2023, building on the X-Phone prototype from 2021."
Output: [
  {"s":"Acme Corp","p":"released","o":"UltraPhone"},
  {"s":"UltraPhone","p":"release_date","o":"November 2023"},
  {"s":"X-Phone prototype","p":"prototype_year","o":"2021"}
]

Message: "Just read that Pfizer and BioNTech collaborated on the COVID-19 vaccine in 2020."
Output: [
  {"s":"Pfizer","p":"collaborated_on","o":"COVID-19 vaccine"},
  {"s":"BioNTech","p":"collaborated_on","o":"COVID-19 vaccine"},
  {"s":"COVID-19 vaccine","p":"year","o":"2020"}
]

Message: "I love hiking, but I'm worried about bears in Yellowstone, so I'll skip it this year."
Output: []
`;

// Job A Worker: Process message metrics and KG
export const jobAWorker = new Worker(
  'jobA',
  async (job) => {
    const { msg_id, user_id, thread_id, content } = job.data;
    
    // DEBUG: Log exact values received by worker
    console.log(`🔍 WORKER DEBUG - Processing message ${msg_id}: userId="${user_id}", threadId="${thread_id}"`);
    
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