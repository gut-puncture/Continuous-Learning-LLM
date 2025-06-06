import Fastify from 'fastify';
import cors from '@fastify/cors';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { insertMessage, getThreadMessages, type Message } from './db/index.js';

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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
});

// Health check route
fastify.get('/healthz', async () => {
  return { ok: true, timestamp: new Date().toISOString() };
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
    
    // Build messages array for OpenAI (convert to OpenAI format)
    const openaiMessages = historyMessages.map((msg: Message) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || ''
    }));
    
    // Add the new user message
    openaiMessages.push({
      role: 'user',
      content: content
    });

    // Insert user message into database
    await insertMessage({
      user_id: userId,
      thread_id: threadId,
      role: 'user',
      content: content,
      token_cnt: 0
    });

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
    await insertMessage({
      user_id: userId,
      thread_id: threadId,
      role: 'assistant',
      content: assistantContent,
      token_cnt: totalTokens
    });

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