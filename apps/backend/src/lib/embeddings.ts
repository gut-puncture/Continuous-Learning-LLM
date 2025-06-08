import OpenAI from 'openai';
import { db } from '../db/index.js';
import { messages } from '../db/schema.js';
import { eq, and, isNull, isNotNull, ne, sql } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replaceAll('\n', ' ');
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input,
  });

  return response.data[0].embedding;
}

/**
 * Process pending embeddings in batches with retry logic
 */
export async function processPendingEmbeddings(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    // Get pending messages (limit to 10 at a time to avoid timeout)
    const pendingMessages = await db
      .select()
      .from(messages)
      .where(and(
        eq(messages.embed_ready, false),
        isNotNull(messages.content)
      ))
      .limit(10);

    if (pendingMessages.length === 0) {
      return { processed: 0, errors: 0 };
    }

    console.log(`Processing ${pendingMessages.length} pending embeddings`);

    for (const message of pendingMessages) {
      try {
        // Generate embedding with retry logic
        const embedding = await generateEmbeddingWithRetry(message.content!);
        
        // Update message with embedding
        await db
          .update(messages)
          .set({
            emb: embedding,
            embed_ready: true
          })
          .where(eq(messages.msg_id, message.msg_id));

        processed++;
        console.log(`✅ Embedded message ${message.msg_id}`);

      } catch (error) {
        console.error(`❌ Failed to embed message ${message.msg_id}:`, error);
        errors++;
        
        // Mark as failed after 3 attempts (we'll implement attempt counting later)
        // For now, just log the error and continue
      }
    }

    return { processed, errors };

  } catch (error) {
    console.error('Error in processPendingEmbeddings:', error);
    throw error;
  }
}

/**
 * Generate embedding with exponential backoff retry
 */
async function generateEmbeddingWithRetry(text: string, maxRetries = 3): Promise<number[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text);
    } catch (error: any) {
      console.log(`Embedding attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries reached');
}

/**
 * Retrieve relevant memories for a user query
 */
export async function retrieveMemories(
  userId: string,
  query: string,
  currentThreadId: string,
  k = 12
): Promise<Array<{ msg_id: number; content: string; distance: number; score: number }>> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Distance and score thresholds from env (with defaults)
    const distanceThreshold = parseFloat(process.env.MEMORY_DISTANCE_THRESHOLD || '0.8');
    const scoreThreshold = parseFloat(process.env.MEMORY_SCORE_THRESHOLD || '0.5');
    
    // SQL query for vector similarity search
    const memories = await db.execute(sql`
      SELECT 
        msg_id,
        content,
        (emb <-> ${JSON.stringify(queryEmbedding)}::vector) AS distance,
        ((emb <-> ${JSON.stringify(queryEmbedding)}::vector) * 0.7 + COALESCE(priority, 0) * -0.3) AS score
      FROM messages
      WHERE user_id = ${userId}
        AND embed_ready = true
        AND priority IS NOT NULL
        AND thread_id != ${currentThreadId}
        AND content IS NOT NULL
        AND (emb <-> ${JSON.stringify(queryEmbedding)}::vector) <= ${distanceThreshold}
      ORDER BY score ASC
      LIMIT ${k}
    `);

    // Filter by score threshold and return results
    return (memories as any[])
      .filter((row: any) => row.score <= scoreThreshold)
      .map((row: any) => ({
        msg_id: row.msg_id,
        content: row.content,
        distance: parseFloat(row.distance),
        score: parseFloat(row.score)
      }));

  } catch (error) {
    console.error('Error retrieving memories:', error);
    return []; // Return empty array on error to avoid breaking chat
  }
} 