#!/usr/bin/env node
import 'dotenv/config';
import { jobAWorker } from './jobs/jobA.js';

console.log('🔄 Starting Job A Worker for message metrics processing...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('💡 Received SIGTERM, closing worker...');
  await jobAWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('💡 Received SIGINT, closing worker...');
  await jobAWorker.close();
  process.exit(0);
});

// Error handling
jobAWorker.on('error', (error) => {
  console.error('❌ Worker error:', error);
});

jobAWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

jobAWorker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

console.log('✅ Job A Worker started and listening for jobs...'); 