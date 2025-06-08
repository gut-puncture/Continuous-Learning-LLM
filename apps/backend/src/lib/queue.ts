import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection for both local and production
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ for blocking operations
  lazyConnect: true,
});

// Job A: Message Metrics & KG Processing Queue
export const metricsQueue = new Queue('message-metrics', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 20,     // Keep last 20 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Job interface for message processing
export interface MessageJobData {
  msg_id: number;
  user_id: string;
  thread_id: string;
  content: string;
}

export { redisConnection }; 