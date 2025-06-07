// Database package main export file
export * from './schema';
export * from './types'; 

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, desc, sql as drizzleSql } from 'drizzle-orm'
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

// New helper functions for thread management
export interface ThreadSummary {
  thread_id: string
  name: string | null
  last_updated: string
  message_count: number
  preview: string
}

export async function getThreadsByUser(userId: string): Promise<ThreadSummary[]> {
  const result = await db
    .select({
      thread_id: messages.thread_id,
      name: messages.thread_name,
      last_updated: drizzleSql<string>`MAX(${messages.created_at})::text`,
      message_count: drizzleSql<number>`COUNT(*)::int`,
      preview: drizzleSql<string>`SUBSTRING(ARRAY_TO_STRING(ARRAY_AGG(${messages.content} ORDER BY ${messages.created_at} DESC), '') FROM 1 FOR 100)`
    })
    .from(messages)
    .where(eq(messages.user_id, userId))
    .groupBy(messages.thread_id, messages.thread_name)
    .orderBy(drizzleSql`MAX(${messages.created_at}) DESC`)

  return result.map(row => ({
    thread_id: row.thread_id,
    name: row.name,
    last_updated: row.last_updated,
    message_count: row.message_count,
    preview: row.preview || ''
  }))
}

export async function updateThreadName(threadId: string, name: string): Promise<void> {
  await db
    .update(messages)
    .set({ thread_name: name })
    .where(eq(messages.thread_id, threadId))
} 