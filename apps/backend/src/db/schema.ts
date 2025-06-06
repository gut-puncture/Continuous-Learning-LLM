// Database schema definitions will go here
// TODO: Implement tables for Phase 3

import { pgTable, bigserial, uuid, text, timestamp, integer, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const messages = pgTable('messages', {
  msg_id: bigserial('msg_id', { mode: 'number' }).primaryKey(),
  user_id: text('user_id').notNull(),
  thread_id: uuid('thread_id').notNull(),
  role: text('role').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  content: text('content'),
  token_cnt: integer('token_cnt')
}, (table) => ({
  roleCheck: check('role_check', sql`${table.role} in ('user', 'assistant')`)
}))

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

export const placeholder = true; 