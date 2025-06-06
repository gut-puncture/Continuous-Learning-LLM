// Database package main export file
export * from './schema';
export * from './types'; 

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, desc } from 'drizzle-orm'
import { messages, type NewMessage, type Message } from './schema'

// Database connection
const connectionString = process.env.DATABASE_URL!
const sql = postgres(connectionString)
export const db = drizzle(sql, { schema: { messages } })

// Helper functions
export async function insertMessage(messageData: NewMessage): Promise<Message> {
  const [inserted] = await db
    .insert(messages)
    .values(messageData)
    .returning()
  return inserted
}

export async function getThreadMessages(threadId: string): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.thread_id, threadId))
    .orderBy(messages.created_at)
} 