import Fastify from 'fastify';
import cors from '@fastify/cors';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { insertMessage, getThreadMessages, getThreadsByUser, updateThreadName, type Message } from './db/index.js';
import { countTokens } from './utils/tokenizer.js';
import { processPendingEmbeddings, retrieveMemories } from './lib/embeddings.js';
import { metricsQueue } from './lib/queue.js';

// Initialize Fastify
const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'test'
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Register CORS
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type'],
  credentials: true
});

// Health check route
fastify.get('/healthz', async () => {
  return { ok: true, timestamp: new Date().toISOString() };
});

// Background processing endpoint for embeddings (legacy support)
fastify.post('/api/process-embeddings', async (request, reply) => {
  try {
    const result = await processPendingEmbeddings();
    
    return {
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    fastify.log.error('Embedding processing failed:', error);
    return reply.code(500).send({ 
      success: false, 
      error: 'Failed to process embeddings',
      timestamp: new Date().toISOString()
    });
  }
});

// Chat route
fastify.post<{
  Body: {
    userId: string;
    threadId?: string;
    content: string;
  };
}>('/chat', async (request, reply) => {
  try {
    const { userId, threadId: requestThreadId, content } = request.body;

    // Validate input
    if (!userId || !content) {
      return reply.code(400).send({ error: 'Missing userId or content' });
    }

    // Generate threadId if not provided
    const threadId = requestThreadId || uuidv4();

    // Get conversation history
    const historyMessages = await getThreadMessages(threadId);
    
    // Count tokens for the user message
    const userTokens = countTokens(content);

    // Insert user message into database with metrics_ready=false
    const userMessage = await insertMessage({
      user_id: userId,
      thread_id: threadId,
      role: 'user',
      content: content,
      token_cnt: userTokens,
      embed_ready: false,
      metrics_ready: false,
      priority: null
    });

    // Enqueue Job A processing for this message (async, non-blocking)
    await metricsQueue.add('process-message-metrics', {
      msg_id: userMessage.msg_id,
      user_id: userId,
      thread_id: threadId,
      content: content
    });

    console.log(`🚀 Enqueued Job A processing for message ${userMessage.msg_id}`);

    // Retrieve relevant memories for this query
    const memories = await retrieveMemories(userId, content, threadId);
    
    // Build messages array for OpenAI
    const openaiMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];
    
    // Always add system prompt at the top of every OpenAI call
    const systemPrompt = process.env.SYSTEM_PROMPT || 'You are MemoryGPT, an assistant with long-term memory.\n<rules>\n1. You may cite memories by id with the syntax [mem123].\n2. If the answer is not in memory and you are unsure, say so honestly.\n</rules>';
    openaiMessages.push({
      role: 'system',
      content: systemPrompt
    });
    
    // Add retrieved memories as system messages
    if (memories.length > 0) {
      console.log(`📚 Retrieved ${memories.length} relevant memories`);
      for (const memory of memories) {
        openaiMessages.push({
          role: 'system',
          content: `<memory id="${memory.msg_id}">${memory.content}</memory>`
        });
      }
    }
    
    // Add conversation history
    openaiMessages.push(...historyMessages.map((msg: Message) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || ''
    })));
    
    // Add the new user message
    openaiMessages.push({
      role: 'user',
      content: content
    });

    console.log(`🤖 Sending to OpenAI: ${openaiMessages.length} messages (${memories.length} memories)`);

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: openaiMessages,
      stream: false,
      temperature: 1
    });

    const assistantContent = response.choices[0]?.message?.content || '';
    const totalTokens = response.usage?.total_tokens || 0;

    // Insert assistant message into database
    const assistantMessage = await insertMessage({
      user_id: userId,
      thread_id: threadId,
      role: 'assistant',
      content: assistantContent,
      token_cnt: totalTokens,
      embed_ready: false,
      metrics_ready: false,
      priority: null
    });

    // Enqueue Job A processing for assistant message too
    await metricsQueue.add('process-message-metrics', {
      msg_id: assistantMessage.msg_id,
      user_id: userId,
      thread_id: threadId,
      content: assistantContent
    });

    console.log(`🚀 Enqueued Job A processing for assistant message ${assistantMessage.msg_id}`);

    // Return response
    return {
      threadId,
      assistant: {
        content: assistantContent,
        tokenCnt: totalTokens
      }
    };

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// History route
fastify.get<{
  Params: { threadId: string };
}>('/history/:threadId', async (request, reply) => {
  try {
    const { threadId } = request.params;
    
    const messages = await getThreadMessages(threadId);
    
    return { 
      messages: messages.map((msg: Message) => ({
        ...msg,
        created_at: msg.created_at?.toISOString() || new Date().toISOString()
      }))
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Get threads for a user
fastify.get<{
  Params: { userId: string };
}>('/threads/:userId', async (request, reply) => {
  try {
    const { userId } = request.params;
    
    const threads = await getThreadsByUser(userId);
    
    return { threads };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Update thread name
fastify.put<{
  Params: { threadId: string };
  Body: { name: string };
}>('/threads/:threadId/name', async (request, reply) => {
  try {
    const { threadId } = request.params;
    const { name } = request.body;
    
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'Name is required and must be a string' });
    }
    
    await updateThreadName(threadId, name);
    
    return { success: true, name };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Backend server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// Export for testing
export default fastify; 