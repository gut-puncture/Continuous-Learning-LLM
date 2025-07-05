import { Worker } from 'bullmq';
import OpenAI from 'openai';
import { eq, and, desc, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { messages, kgNodes, kgEdges, msgToNode, type Message } from '../db/schema.js';
import { redisConnection, type MessageJobData } from '../lib/queue.js';
import { 
  canonicalizeLabels, 
  MapEmbeddingCache, 
  MapNodeCache,
  type CanonicalResult 
} from '../utils/canonicalize.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Constants from our plan
const BULL_CONCURRENCY = 3;
const MAX_LABELS_PER_MESSAGE = 6;

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
You are a helpfulness evaluator. Given a raw, potentially messy conversation (including both user and assistant messages) and a candidate assistant response, output a single decimal between 0.0 (not helpful) and 1.0 (extremely helpful). Respond with only the numeric score.

Scale:
- 0.0 → completely irrelevant, off-topic, or confusing.
- 0.2 → minimal engagement (greetings, simple acknowledgements) without useful content.
- 0.5 → partial assistance or clarifying questions that may require follow-up.
- 0.8 → largely useful advice but missing minor details or examples.
- 1.0 → fully addresses the user's need with clear, actionable, and specific guidance.

Instructions:
- Focus solely on how much the response helps solve the user's problem.
- Ignore tone, grammar, or politeness; judge utility.
- Output only one decimal place.

Examples:
Conversation:
User: "I keep getting a 502 Bad Gateway when I call POST /login. What might be wrong?"
Assistant: "Check your server logs for timeout errors and confirm your database is accepting connections."
Target Response: "It looks like your DB connection pool is exhausted. Increase the pool size in your config."
Helpfulness: 1.0

Conversation:
User: "Um, hi?"
Assistant: "Hello!"
Target Response: "Yes."
Helpfulness: 0.0

Conversation:
User: "How do I center a div vertically and horizontally?"
Assistant: "Use flexbox: \`display: flex; align-items: center; justify-content: center;\`."
Target Response: "Thanks, that worked!"
Helpfulness: 1.0

Conversation:
User: "The UI broke after I updated Tailwind, and no errors show up."
Assistant: "Inspect the CSS build output and ensure your purge settings include all component paths."
Target Response: "I checked and PurgeCSS was removing my classes—fixed now."
Helpfulness: 0.8

Conversation:
User: "I'm so frustrated my code won't compile—everything is red!"
Assistant: "Try running \`pnpm install\` to ensure dependencies are up to date."
Target Response: "That fixed missing modules. Thanks."
Helpfulness: 0.7

Conversation:
User: "What's the difference between var, let, and const in JavaScript?"
Assistant: "var is function-scoped, let and const are block-scoped; const cannot be reassigned."
Target Response: "Got it—const for values, let for variables, avoid var."
Helpfulness: 1.0

Conversation:
User: "Our customer satisfaction dropped by 10% last month, and we didn't change anything."
Assistant: "Review recent feature releases or support tickets for possible negative feedback."
Target Response: "Good idea, I'll check the ticket history."
Helpfulness: 0.8

Conversation:
User: "Just some random chitchat."
Assistant: "Nice!"
Target Response: "Cool."
Helpfulness: 0.0
`;

const EXCITEMENT_PROMPT = `
You are an excitement scorer. Given a single user message, output a decimal between 0.0 (completely mundane) and 1.0 (extremely exciting). Respond with only the number.

Scale Guidance:
- 0.0 → factual, neutral, unremarkable statements.
- 0.2 → slight interest or routine updates.
- 0.5 → moderately engaging or pleasant news.
- 0.8 → highly positive, energetic or emotionally charged content.
- 1.0 → breakthrough achievements, major celebrations, or thrilling events.

Instructions:
- Base your rating on the user's tone and content.
- Use one decimal place.

Examples:
Message: "I made coffee."
Excitement: 0.0

Message: "Just fixed a minor typo in my doc."
Excitement: 0.1

Message: "Our team's sales jumped by 25% this quarter after the marketing overhaul!"
Excitement: 0.9

Message: "I can't believe I finally deployed the new feature—this was a nightmare to get right."
Excitement: 0.8

Message: "Ugh, I'm stuck debugging a weird null reference error that only appears in prod."
Excitement: 0.0

Message: "I completed my PhD thesis defense yesterday. They said I passed with honors!"
Excitement: 1.0

Message: "So, like, I visited Paris and did all the touristy stuff—Eiffel Tower was lit up so beautifully it gave me chills."
Excitement: 0.7

Message: "I just discovered a new algorithm that reduces compute time by 40%."
Excitement: 0.85

Message: "Last night, my code finally merged without conflicts—and no tests failed!"
Excitement: 0.75

Message: "The conference was okay, I talked about project updates."
Excitement: 0.3
`;

const TRIPLE_EXTRACTION_PROMPT = `
Extract factual triples from a single user message to build a knowledge graph.

Detailed Definitions:
- subject (s): the main actor or entity performing or experiencing something; answers "who" or "what".
- relation (p): the verb or relationship connecting subject and object; a concise action or attribute in snake_case; answers "what happened" or "what is".
- object (o): the entity, property, or target acted upon or described; answers "what" or "whom".
- preferences: if the message expresses liking or desire, include it as a factual relation in snake_case (e.g., loves_to, wants_to).

Clear Rules:
1. Focus on objective facts and clear preferences; ignore filler words.
2. Choose up to the 3 most important facts in order of appearance.
3. Output only a JSON array of objects [{"s":"...","p":"...","o":"..."}].
4. Do not include any extra text, comments, or keys.
5. If no factual triple exists, output an empty array: []

Examples:
Message: "User: I love hiking but I'm worried about bears in Yellowstone, so I'll skip it this year."
Output: [{"s":"I","p":"loves_to","o":"hike"}]

Message: "User: I'm planning a trip to the Grand Canyon next month and booked a guided hiking tour. I'm nervous about the weather there."
Output: [{"s":"I","p":"planning_trip","o":"Grand Canyon next month"},{"s":"I","p":"booked","o":"guided hiking tour"}]

Message: "User: The Python script fails with a UnicodeDecodeError when processing CSV files. I think the encoding is wrong, maybe it's not UTF-8."
Output: [{"s":"The Python script","p":"fails_with","o":"UnicodeDecodeError"},{"s":"I","p":"suspects","o":"encoding not UTF-8"}]

Message: "User: Our sales increased by 20% in Q1 after the new marketing campaign, but Q2 numbers fell back to baseline."
Output: [{"s":"Our sales","p":"increased","o":"20% in Q1"},{"s":"Q2 numbers","p":"fell_to","o":"baseline"}]

Message: "User: I tried upgrading to Node 18 and my app crashed on startup. The logs show a deprecated API warning and then a segmentation fault. I need a workaround."
Output: [{"s":"I","p":"upgraded_to","o":"Node 18"},{"s":"the app","p":"crashed_on","o":"startup"}]

Message: "User: In December 2021, NASA launched the James Webb Space Telescope after many delays. The launch cost was approximately $10 billion."
Output: [{"s":"NASA","p":"launched","o":"James Webb Space Telescope"},{"s":"launch","p":"date","o":"December 2021"},{"s":"launch","p":"cost","o":"$10 billion"}]

Message: "User: Hey, I've been working on my new product called Mini-CLM. It's going to be a continuous learning LLM, and I wanted some help with the Louvain Clustering Algorithm."
Output: [{"s":"I","p":"working_on","o":"continuous learning llm"}]

Message: "User: The data pipeline to generate the FRP is very complicated, it leads to a lot of errors every month. I want to simplify the pipeline or plug the issues by reducing tech debt. I will pitch this to my boss soon."
Output: [{"s":"The data pipeline to generate the FRP","p":"degree_of_complexity","o":"very complicated"},{"s":"I","p":"wants_to","o":"simplify the data pipeline to generate the FRP"}]

Message: "User: I just switched my laptop from Windows to Linux last night and it boots twice as fast now."
Output: [{"s":"I","p":"switched_from","o":"Windows"},{"s":"I","p":"switched_to","o":"Linux"}]

Message: "User: Last week, I deployed the new authentication service and then updated the database schema; everything is working now."
Output: [{"s":"I","p":"deployed","o":"new authentication service"},{"s":"I","p":"updated","o":"database schema"}]

Message: "User: We booked flights to Tokyo on June 5th, 2024, and reserved a hotel near Shibuya station."
Output: [{"s":"We","p":"booked","o":"flights to Tokyo on June 5th, 2024"},{"s":"We","p":"reserved","o":"hotel near Shibuya station"}]

Message: "User: My PhD thesis defense is on Friday at 10am in room 301. I've been preparing slides since last month."
Output: [{"s":"my PhD thesis defense","p":"scheduled_for","o":"Friday at 10am in room 301"},{"s":"I","p":"preparing","o":"slides since last month"}]

Message: "User: I spent $150 on groceries this morning, then picked up coffee with Sarah downtown."
Output: [{"s":"I","p":"spent","o":"$150 on groceries this morning"},{"s":"I","p":"picked_up","o":"coffee with Sarah downtown"}]
`;

/**
 * Helper function to check and restore cached embeddings from job retry data
 */
function restoreCachedEmbeddings(job: any): Map<string, number[]> {
  const cache = new Map<string, number[]>();
  
  try {
    const progress = job.progress();
    if (progress && progress.cachedEmbeddings) {
      for (const [label, embedding] of progress.cachedEmbeddings) {
        cache.set(label, embedding);
      }
      console.log(`📦 Restored ${cache.size} cached embeddings from retry`);
    }
  } catch (error) {
    console.warn('Failed to restore cached embeddings:', error);
  }
  
  return cache;
}

/**
 * Helper function to save embeddings to job progress for retry scenarios
 */
async function saveCachedEmbeddings(job: any, embedCache: MapEmbeddingCache): Promise<void> {
  try {
    const cacheEntries = Array.from((embedCache as any).cache.entries());
    await job.updateProgress({ 
      cachedEmbeddings: cacheEntries,
      timestamp: Date.now()
    });
  } catch (error) {
    console.warn('Failed to save cached embeddings:', error);
  }
}

// Job A Worker: Process message metrics and KG
export const jobAWorker = new Worker(
  'message-metrics',
  async (job) => {
    const { msg_id, user_id, thread_id, content } = job.data;
    
    // DEBUG: Log exact values received by worker
    console.log(`🔍 WORKER DEBUG - Processing message ${msg_id}: userId="${user_id}", threadId="${thread_id}"`);
    
    console.log(`🔄 Processing message ${msg_id} for user ${user_id}`);
    
    // Initialize caches for this job
    const embedCache = new MapEmbeddingCache();
    const nodeCache = new MapNodeCache();
    
    // Restore any cached embeddings from previous retry attempts
    const restoredEmbeddings = restoreCachedEmbeddings(job);
    for (const [label, embedding] of restoredEmbeddings.entries()) {
      embedCache.set(label, embedding);
    }
    
    let messageEmb: number[] | null = null;
    let sentiment = 0;
    let helpfulness = 0;
    let excitement = 0;
    let novelty = 0;
    let centrality = 0;
    let priority = 0;
    
    try {
      // Step 1: Generate embedding first (if not already done)
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
      sentiment = parseInt(sentimentResult.choices[0].message.content?.trim() || '0');
      helpfulness = parseFloat(helpfulnessResult.choices[0].message.content?.trim() || '0');
      excitement = parseFloat(excitementResult.choices[0].message.content?.trim() || '0');
      
      let triples: Array<{s: string, p: string, o: string}> = [];
      try {
        const triplesText = triplesResult.choices[0].message.content?.trim() || '[]';
        triples = JSON.parse(triplesText);
      } catch (error) {
        console.warn(`Failed to parse triples for message ${msg_id}:`, error);
        triples = [];
      }
      
      // Step 4: Calculate novelty (requires embedding)
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
      
      // Step 5: Calculate initial priority (without centrality for now)
      priority = 0.3 * novelty + 0.3 * excitement + 0.2 * helpfulness + 0.1 * centrality + 0.1 * Math.abs(sentiment);
      
      // Step 6: SAVE METRICS IMMEDIATELY - Decouple from KG processing
      await db.update(messages)
        .set({
          sentiment,
          excitement,
          helpfulness,
          novelty,
          centrality, // Will be 0 initially, updated after KG processing
          priority,
          metrics_ready: true
        })
        .where(eq(messages.msg_id, msg_id));
      
      console.log(`✅ Metrics saved for message ${msg_id}: sentiment=${sentiment}, excitement=${excitement}, helpfulness=${helpfulness}, novelty=${novelty}, priority=${priority}`);
      
      // Step 7: NEW CANONICAL KNOWLEDGE GRAPH PROCESSING
      try {
        if (triples.length === 0) {
          console.log(`📝 No triples extracted for message ${msg_id}, skipping KG processing`);
          return { success: true, msg_id, metrics: { sentiment, excitement, helpfulness, novelty, centrality, priority } };
        }
        
        // Collect all unique labels from triples (subject + object)
        const allLabels = [...new Set(triples.flatMap(triple => [triple.s, triple.o]))];
        console.log(`🏷️  Processing ${allLabels.length} unique labels from ${triples.length} triples for message ${msg_id}`);
        
        // Single batch embedding call for all unique labels
        let labelEmbeddings: { [label: string]: number[] } = {};
        const labelsNeedingEmbedding = allLabels.filter(label => !embedCache.get(label.toLowerCase().trim()));
        
        if (labelsNeedingEmbedding.length > 0) {
          console.log(`🔤 Generating embeddings for ${labelsNeedingEmbedding.length} new labels`);
          
          const batchEmbResponse = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: labelsNeedingEmbedding.map(label => label.toLowerCase().trim()),
          });
          
          // Cache all new embeddings
          batchEmbResponse.data.forEach((embData, index) => {
            const normalizedLabel = labelsNeedingEmbedding[index].toLowerCase().trim();
            embedCache.set(normalizedLabel, embData.embedding);
            labelEmbeddings[normalizedLabel] = embData.embedding;
          });
          
          // Save embeddings to job progress for retry resilience
          await saveCachedEmbeddings(job, embedCache);
          console.log(`💾 Cached ${Object.keys(labelEmbeddings).length} new embeddings`);
        }
        
        // Canonicalize all labels using our new utility
        const canonicalResults = await canonicalizeLabels(
          allLabels,
          user_id,
          db,
          openai,
          embedCache,
          nodeCache
        );
        
        console.log(`🔗 Canonicalized ${canonicalResults.length} labels, ${canonicalResults.filter(r => r.wasCreated).length} new nodes created`);
        
        // Build label->nodeId mapping for edge creation
        const labelToNodeId = new Map<string, number>();
        canonicalResults.forEach(result => {
          labelToNodeId.set(result.label, result.nodeId);
        });
        
        // Create edges between canonicalized nodes
        const processedNodes = new Set<number>();
        
        for (const triple of triples) {
          const subjectLabel = triple.s.toLowerCase().trim();
          const objectLabel = triple.o.toLowerCase().trim();
          
          const subjectNodeId = labelToNodeId.get(subjectLabel);
          const objectNodeId = labelToNodeId.get(objectLabel);
          
          if (subjectNodeId && objectNodeId) {
            // Insert or increment edge weight
            await db.insert(kgEdges)
              .values({
                user_id,
                subject_id: subjectNodeId,
                relation: triple.p,
                object_id: objectNodeId,
                weight: 1
              })
              .onConflictDoUpdate({
                target: [kgEdges.user_id, kgEdges.subject_id, kgEdges.relation, kgEdges.object_id],
                set: { weight: sql`${kgEdges.weight} + 1` }
              });
            
            // Update node degrees
            await db.update(kgNodes)
              .set({ degree: sql`${kgNodes.degree} + 1` })
              .where(eq(kgNodes.node_id, subjectNodeId));
            
            await db.update(kgNodes)
              .set({ degree: sql`${kgNodes.degree} + 1` })
              .where(eq(kgNodes.node_id, objectNodeId));
            
            processedNodes.add(subjectNodeId);
            processedNodes.add(objectNodeId);
          }
        }
        
        // Link message to all processed nodes
        for (const nodeId of processedNodes) {
          await db.insert(msgToNode)
            .values({ msg_id, node_id: nodeId })
            .onConflictDoNothing();
        }
        
        // Step 8: Update centrality and recalculate priority (degree-based for now)
        if (processedNodes.size > 0) {
          const nodesDegrees = await db.select()
            .from(kgNodes)
            .where(and(
              eq(kgNodes.user_id, user_id),
              sql`${kgNodes.node_id} = ANY(${Array.from(processedNodes)})`
            ));
          
          const avgDegree = nodesDegrees.reduce((sum: number, node: any) => sum + (node.degree || 0), 0) / nodesDegrees.length;
          centrality = Math.min(avgDegree / 10, 1.0); // Normalize to 0-1
          
          // Recalculate priority with centrality
          priority = 0.3 * novelty + 0.3 * excitement + 0.2 * helpfulness + 0.1 * centrality + 0.1 * Math.abs(sentiment);
          
          // Update with new centrality and priority
          await db.update(messages)
            .set({
              centrality,
              priority
            })
            .where(eq(messages.msg_id, msg_id));
        }
        
        console.log(`✅ KG processing completed for message ${msg_id}, processed ${processedNodes.size} nodes`);
        
      } catch (kgError) {
        console.error(`⚠️  KG processing failed for message ${msg_id}, but metrics were already saved:`, kgError);
        
        // Save embeddings before throwing so retry can reuse them
        await saveCachedEmbeddings(job, embedCache);
        
        // Don't throw - metrics are already saved, KG failure shouldn't fail the entire job
        // But we should still log this for monitoring
      }
      
      console.log(`✅ Completed processing message ${msg_id}: sentiment=${sentiment}, excitement=${excitement}, helpfulness=${helpfulness}, novelty=${novelty}, centrality=${centrality}, priority=${priority}`);
      
      return { success: true, msg_id, metrics: { sentiment, excitement, helpfulness, novelty, centrality, priority } };
      
    } catch (error) {
      console.error(`❌ Failed to process message ${msg_id}:`, error);
      
      // Save any embeddings we managed to generate before failing
      await saveCachedEmbeddings(job, embedCache);
      
      throw error;
    }
  }, {
    connection: redisConnection,
    concurrency: BULL_CONCURRENCY, // Updated from 2 to 3 as per our plan
  });