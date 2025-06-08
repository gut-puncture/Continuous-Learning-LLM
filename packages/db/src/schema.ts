// Database schema definitions will go here
// TODO: Implement tables for Phase 3

import { pgTable, bigserial, uuid, text, timestamp, integer, check, vector, boolean, real } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const messages = pgTable('messages', {
  msg_id: bigserial('msg_id', { mode: 'number' }).primaryKey(),
  user_id: uuid('user_id').notNull(),
  thread_id: uuid('thread_id').notNull(),
  role: text('role').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  content: text('content'),
  token_cnt: integer('token_cnt'),
  thread_name: text('thread_name'),
  emb: vector('emb', { dimensions: 3072 }),
  embed_ready: boolean('embed_ready').default(false),
  priority: real('priority')
}, (table) => ({
  roleCheck: check('role_check', sql`${table.role} in ('user', 'assistant', 'system', 'introspection')`)
}))

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

export const placeholder = true; 