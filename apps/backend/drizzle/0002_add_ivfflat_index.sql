-- Enable index for user-scoped similarity searches on kg_nodes
-- Note: ANN indexes (ivfflat/hnsw) don't support 3072 dimensions in pgvector 0.8.0
-- For now we use btree on user_id to optimize user-scoped vector searches

CREATE INDEX IF NOT EXISTS kg_nodes_user_id_idx 
  ON kg_nodes (user_id) 
  WHERE emb IS NOT NULL;

-- Analyze the table to update planner statistics
ANALYZE kg_nodes; 