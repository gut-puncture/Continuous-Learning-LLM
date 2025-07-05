import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type OpenAI from 'openai';
import { kgNodes } from '../db/schema.js';

// Constants from our plan
const THRESHOLD_COSINE = 0.15;
const MAX_LABELS_PER_MESSAGE = 6;
const MAX_LABEL_LENGTH = 256; // Prevent token limit issues

/**
 * Cache structure for embeddings and node resolutions
 */
export interface EmbeddingCache {
  get(label: string): number[] | undefined;
  set(label: string, embedding: number[]): void;
}

export interface NodeCache {
  get(label: string): number | undefined;
  set(label: string, nodeId: number): void;
}

/**
 * Result of canonical label resolution
 */
export interface CanonicalResult {
  nodeId: number;
  label: string;
  wasCreated: boolean;
}

/**
 * Canonicalize a label by applying normalization, exact matching, and cosine similarity checking
 * 
 * Algorithm:
 * 1. Normalize: lowercase + trim
 * 2. Check cache for previous resolution
 * 3. Try exact match in database
 * 4. If no exact match, compute embedding and find similar nodes (cosine < 0.15)
 * 5. If no similar node found, create new node with embedding
 * 6. Cache result and return
 * 
 * @param label - Raw label from triple extraction
 * @param userId - User ID for scoping
 * @param db - Database connection
 * @param openai - OpenAI client for embeddings
 * @param embedCache - Cache for label embeddings
 * @param nodeCache - Cache for label -> nodeId mappings
 * @returns Promise resolving to canonical node info
 */
export async function canonicalizeLabel(
  label: string,
  userId: string,
  db: any, // DrizzleD1Database type is complex, using any for now
  openai: OpenAI,
  embedCache: EmbeddingCache,
  nodeCache: NodeCache
): Promise<CanonicalResult> {
  // Step 1: Normalize label
  let normalizedLabel = label.toLowerCase().trim();
  
  // Prevent token limit issues with very long labels
  if (normalizedLabel.length > MAX_LABEL_LENGTH) {
    normalizedLabel = normalizedLabel.slice(0, MAX_LABEL_LENGTH);
  }
  
  // Step 2: Check cache first
  const cachedNodeId = nodeCache.get(normalizedLabel);
  if (cachedNodeId !== undefined) {
    return {
      nodeId: cachedNodeId,
      label: normalizedLabel,
      wasCreated: false
    };
  }
  
  // Step 3: Try exact match in database
  const exactMatch = await db.select({ node_id: kgNodes.node_id })
    .from(kgNodes)
    .where(and(eq(kgNodes.user_id, userId), eq(kgNodes.label, normalizedLabel)))
    .limit(1);
  
  if (exactMatch.length > 0) {
    const nodeId = exactMatch[0].node_id;
    nodeCache.set(normalizedLabel, nodeId);
    return {
      nodeId,
      label: normalizedLabel,
      wasCreated: false
    };
  }
  
  // Step 4: No exact match, need embedding for similarity check
  let embedding = embedCache.get(normalizedLabel);
  if (!embedding) {
    try {
      const embResponse = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: normalizedLabel,
      });
      embedding = embResponse.data[0].embedding;
      embedCache.set(normalizedLabel, embedding);
    } catch (error) {
      console.warn(`Failed to generate embedding for label "${normalizedLabel}":`, error);
      // Continue without embedding check - will create new node
    }
  }
  
  // Step 5: Similarity probe if we have embedding
  if (embedding) {
    try {
      const similarityResults = await db.execute(sql`
        SELECT node_id, emb <=> ${embedding}::vector AS dist
        FROM kg_nodes
        WHERE user_id = ${userId} AND emb IS NOT NULL
        ORDER BY emb <=> ${embedding}::vector
        LIMIT 1
      `);
      
      if (similarityResults.length > 0) {
        const result = similarityResults[0] as any;
        const distance = parseFloat(result.dist);
        
        if (distance < THRESHOLD_COSINE) {
          // Found similar node, reuse it
          const nodeId = result.node_id;
          nodeCache.set(normalizedLabel, nodeId);
          return {
            nodeId,
            label: normalizedLabel,
            wasCreated: false
          };
        }
      }
    } catch (error) {
      console.warn(`Similarity search failed for label "${normalizedLabel}":`, error);
      // Continue to create new node
    }
  }
  
  // Step 6: No similar node found, create new node
  try {
    const newNodeResult = await db.insert(kgNodes)
      .values({
        user_id: userId,
        label: normalizedLabel,
        emb: embedding || null,
        degree: 0
      })
      .onConflictDoNothing()
      .returning({ node_id: kgNodes.node_id });
    
    let nodeId: number;
    
    if (newNodeResult.length > 0) {
      // Successfully inserted
      nodeId = newNodeResult[0].node_id;
    } else {
      // Conflict occurred (concurrent insert), fetch the existing node
      const existingNode = await db.select({ node_id: kgNodes.node_id })
        .from(kgNodes)
        .where(and(eq(kgNodes.user_id, userId), eq(kgNodes.label, normalizedLabel)))
        .limit(1);
      
      if (existingNode.length === 0) {
        throw new Error(`Failed to create or find node for label "${normalizedLabel}"`);
      }
      
      nodeId = existingNode[0].node_id;
    }
    
    nodeCache.set(normalizedLabel, nodeId);
    
    return {
      nodeId,
      label: normalizedLabel,
      wasCreated: newNodeResult.length > 0
    };
    
  } catch (error) {
    console.error(`Failed to create node for label "${normalizedLabel}":`, error);
    throw error;
  }
}

/**
 * Process a list of labels and return canonical results
 * Limits to MAX_LABELS_PER_MESSAGE for performance
 */
export async function canonicalizeLabels(
  labels: string[],
  userId: string,
  db: any,
  openai: OpenAI,
  embedCache: EmbeddingCache,
  nodeCache: NodeCache
): Promise<CanonicalResult[]> {
  // Limit labels to prevent overwhelming the system
  const limitedLabels = labels.slice(0, MAX_LABELS_PER_MESSAGE);
  
  const results: CanonicalResult[] = [];
  
  for (const label of limitedLabels) {
    try {
      const result = await canonicalizeLabel(label, userId, db, openai, embedCache, nodeCache);
      results.push(result);
    } catch (error) {
      console.error(`Failed to canonicalize label "${label}":`, error);
      // Continue with other labels rather than failing entire batch
    }
  }
  
  return results;
}

/**
 * Simple Map-based cache implementations
 */
export class MapEmbeddingCache implements EmbeddingCache {
  private cache = new Map<string, number[]>();
  
  get(label: string): number[] | undefined {
    return this.cache.get(label);
  }
  
  set(label: string, embedding: number[]): void {
    this.cache.set(label, embedding);
  }
}

export class MapNodeCache implements NodeCache {
  private cache = new Map<string, number>();
  
  get(label: string): number | undefined {
    return this.cache.get(label);
  }
  
  set(label: string, nodeId: number): void {
    this.cache.set(label, nodeId);
  }
} 