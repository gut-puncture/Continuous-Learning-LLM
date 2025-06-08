// Database schema definitions will go here
// TODO: Implement tables for Phase 3

import { pgTable, bigserial, uuid, text, timestamp, integer, check, vector, boolean, real, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const messages = pgTable('messages', {
  msg_id: bigserial('msg_id', { mode: 'number' }).primaryKey(),
  user_id: text('user_id').notNull(),
  thread_id: uuid('thread_id').notNull(),
  role: text('role').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  content: text('content'),
  token_cnt: integer('token_cnt'),
  thread_name: text('thread_name'),
  emb: vector('emb', { dimensions: 3072 }),
  embed_ready: boolean('embed_ready').default(false),
  priority: real('priority'),
  // Job A metrics
  sentiment: integer('sentiment'), // -5 to +5
  excitement: real('excitement'), // 0.0 to 1.0
  helpfulness: real('helpfulness'), // 0.0 to 1.0
  novelty: real('novelty'), // 0.0 to 1.0
  centrality: real('centrality'), // 0.0 to 1.0
  metrics_ready: boolean('metrics_ready').default(false),
  duplicate_of: integer('duplicate_of'), // references msg_id if this is a duplicate
  dedup_ready: boolean('dedup_ready').default(false),
  cluster_id: integer('cluster_id')
}, (table) => ({
  roleCheck: check('role_check', sql`${table.role} in ('user', 'assistant', 'system', 'introspection')`)
}))

// Knowledge Graph Nodes (entities)
export const kgNodes = pgTable('kg_nodes', {
  node_id: bigserial('node_id', { mode: 'number' }).primaryKey(),
  user_id: text('user_id').notNull(),
  label: text('label').notNull(), // canonicalized entity name
  emb: vector('emb', { dimensions: 3072 }), // embedding of the label
  degree: integer('degree').default(0), // number of edges connected
  eig_cent: real('eig_cent').default(0), // eigenvector centrality
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  userLabelUnique: uniqueIndex('kg_nodes_user_label_unique').on(table.user_id, table.label)
}))

// Knowledge Graph Edges (relationships)
export const kgEdges = pgTable('kg_edges', {
  edge_id: bigserial('edge_id', { mode: 'number' }).primaryKey(),
  user_id: text('user_id').notNull(),
  subject_id: integer('subject_id').notNull(),
  relation: text('relation').notNull(),
  object_id: integer('object_id').notNull(),
  weight: integer('weight').default(1), // incremented each time this triple is seen
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  subjectObjectRelationUnique: uniqueIndex('kg_edges_unique').on(table.user_id, table.subject_id, table.relation, table.object_id)
}))

// Message to Node mapping (which nodes does each message reference)
export const msgToNode = pgTable('msg_to_node', {
  mapping_id: bigserial('mapping_id', { mode: 'number' }).primaryKey(),
  msg_id: integer('msg_id').notNull(),
  node_id: integer('node_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  msgNodeUnique: uniqueIndex('msg_to_node_unique').on(table.msg_id, table.node_id)
}))

// Clusters for Job B
export const clusters = pgTable('clusters', {
  cluster_id: bigserial('cluster_id', { mode: 'number' }).primaryKey(),
  user_id: text('user_id').notNull(),
  cluster_name: text('cluster_name'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
})

export const clusterMembers = pgTable('cluster_members', {
  membership_id: bigserial('membership_id', { mode: 'number' }).primaryKey(),
  cluster_id: integer('cluster_id').notNull(),
  msg_id: integer('msg_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  clusterMsgUnique: uniqueIndex('cluster_members_unique').on(table.cluster_id, table.msg_id)
}))

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type KgNode = typeof kgNodes.$inferSelect
export type NewKgNode = typeof kgNodes.$inferInsert
export type KgEdge = typeof kgEdges.$inferSelect
export type NewKgEdge = typeof kgEdges.$inferInsert
export type MsgToNode = typeof msgToNode.$inferSelect
export type NewMsgToNode = typeof msgToNode.$inferInsert
export type Cluster = typeof clusters.$inferSelect
export type NewCluster = typeof clusters.$inferInsert
export type ClusterMember = typeof clusterMembers.$inferSelect
export type NewClusterMember = typeof clusterMembers.$inferInsert

export const placeholder = true; 