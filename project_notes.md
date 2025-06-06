## High-Level Implementation Road-map

*(Heroku + Vercel stack • Qwen 3-Embedding 8 B • GPT-4o for chat & background jobs)*

I break the work into **6 phases**.  Each phase contains bite-sized “AI-codable” tasks you can hand straight to GPT-4o (or another coding-capable model) plus the manual glue you still need to do yourself.

---

### PHASE 0 Project plumbing (½ day)

| #   | Deliverable                                                                 | AI-coded task stub                                    | Human setup                                             |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| 0.1 | **Monorepo** (`apps/frontend`, `apps/backend`, `packages/shared`) on GitHub | `pnpm create turbo` scaffold                          | Create Heroku & Vercel projects, add env-vars           |
| 0.2 | **CI / CD**                                                                 | Generate GitHub Actions: lint → test → deploy-preview | Connect Heroku API key and Vercel token in repo secrets |
| 0.3 | **Postgres + pgvector** add-on on Heroku                                    | SQL migration file for `CREATE EXTENSION vector;`     | Run `heroku addons:create heroku-postgresql:mini`       |

---

### PHASE 1 Bare-bones chat (1–2 days)

| #   | Feature                              | Implement with                                             | Notes / sources |
| --- | ------------------------------------ | ---------------------------------------------------------- | --------------- |
| 1.1 | Next.js 15 chat UI on Vercel         | `create next-app --typescript` + shadcn/ui Chat components |                 |
| 1.2 | Backend `/chat` route on Heroku      | Fastify + `ai` SDK, streams GPT-4o                         |                 |
| 1.3 | Google OAuth (NextAuth.js)           | Generate the callback route & JWT cookie logic             |                 |
| 1.4 | Store messages in **messages** table | SQL: see schema §Phase 3                                   | No vector yet   |

*Hand GPT-4o a prompt like “create a Next.js chat component with streaming SSE.”  Paste result, commit, ship.*

---

### PHASE 2 Embeddings + retrieval (½ day)

1. **Pick the model**
   *Use the **standard PyTorch checkpoint** `Qwen/Qwen3-Embedding-8B` once it lands (the GGUF build is for local llama.cpp; PyTorch weights work with vLLM/HF Inference Endpoints).* ([huggingface.co][1], [huggingface.co][2])

2. **Get an API**
   *Cheapest path:* spin up a **Hugging Face Inference Endpoint** (one click, \~\$0.60/hour for A10G) ([huggingface.co][3]).  Together AI does **not yet** list Qwen embeddings; if they add it later you can swap the base URL.

3. **AI-coded tasks**

   * Build a `/embed` helper (caches vectors per `msg_id`).
   * Modify `/chat` route: after DB insert → call `/embed` → store `emb`.
   * Add `SELECT ... ORDER BY inner_product(emb, $query)` retrieval using pgvector.

---

### PHASE 3 Full data-model & background workers (2–3 days)

| Table / job                                  | What the AI writes                                                                                                                                        | Execution cadence         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `messages`                                   | SQL migration (see schema below)                                                                                                                          | instant                   |
| Hourly **metrics job**                       | Node script: compute sentiment (VADER), topic (zero-shot CLIP zero-shot), excitement & helpfulness (GPT-4o classifier), novelty (cosine vs last 500 msgs) | worker dyno, every 10 min |
| `kg_nodes`, `kg_edges`, `msg_to_node`        | LLM prompt for *(subject, relation, object)* triples; MERGE into Postgres tables                                                                          | same hourly job           |
| `cluster_members`, `clusters`                | Python job with NetworkX `louvain_communities`                                                                                                            | hourly                    |
| `insights` (row with `role='introspection'`) | daily cron @ 02:00; prompt GPT-4o to summarise clusters & emit JSON                                                                                       | daily                     |

**Schema (Heroku Postgres, pgvector 1536-d)**

```sql
create table messages(
  msg_id       bigserial primary key,
  user_id      uuid not null,
  thread_id    uuid not null,
  role         text check (role in ('user','assistant','system','introspection')),
  created_at   timestamptz default now(),
  content      text not null,
  token_cnt    int,
  emb          vector(1536),          -- Qwen3-Embedding-8B
  sentiment    smallint,              -- −5 … +5
  topic        text,
  excitement   float,
  helpfulness  float,
  novelty      float,
  centrality   float,
  priority     float,
  duplicate_of bigint references messages,
  cluster_id   bigint
);

create table kg_nodes(
  node_id      bigserial primary key,
  label        text
);

create table kg_edges(
  edge_id      bigserial primary key,
  src_id       bigint references kg_nodes,
  rel          text,
  tgt_id       bigint references kg_nodes,
  weight       int default 1
);

create table msg_to_node(
  msg_id       bigint references messages,
  node_id      bigint references kg_nodes
);

create table clusters(
  cluster_id   bigserial primary key,
  name         text,
  created_at   timestamptz default now()
);
create table cluster_members(
  cluster_id   bigint references clusters,
  msg_id       bigint references messages
);
```

---

### PHASE 4 Retrieval-augmented chat & re-ranking (½ day)

| Step | Implementation                                                                 |
| ---- | ------------------------------------------------------------------------------ |
| 4.1  | Upon new user prompt compute `q_emb`.                                          |
| 4.2  | Fetch top-`k` messages `ORDER BY (emb <#> q_emb) * 0.7 + priority * 0.3 DESC`. |
| 4.3  | Inline the retrieved snippets under a `<memories>` tag before calling GPT-4o.  |

*(The 0.7/0.3 mix mimics Topology’s “similarity plus weights.”)*

---

### PHASE 5 Insight-to-fine-tune loop (optional, 1 day)

1. **Format batch**

   ```yaml
   - user: "What did we learn yesterday about <cluster-name>?"
     assistant: "<insight text>"
   ```
2. **OpenAI fine-tune** on GPT-4o-mini (cheap) nightly.  No GPU to rent.
3. **Deploy**: once OpenAI reports the new model ID update the env-var `LLM_MODEL_ID`.

---

### PHASE 6 Polish & guard-rails (ongoing)

* Rate-limit per user.
* Handle embedding API time-outs with retry.
* Add simple admin dashboard (Supabase Studio works even for Heroku PG).
* Optional prune/archive script once DB > 1 GB, but you said you can skip for now.

---

## Subject-Relation-Object extraction details

1. **Prompt** each new user/assistant message:

   > *Extract up to five factual triples in JSON:
   > `[{"subject": "...", "relation": "...", "object": "..."}]`*

2. **Parse** JSON; for each triple `MERGE` into `kg_nodes` and `kg_edges`.

3. **Update centrality**: hourly `WITH RECURSIVE` PageRank or `networkx.pagerank` script; write result to `messages.centrality`.

*(Centrality is then folded into `priority = 0.4 sim + 0.2 centrality + …`)*

---

## Louvain clustering in this pipeline

*Input graph:* **message-similarity graph** (top-20 neighbours per message).
*Algorithm:* `networkx.algorithms.community.louvain_communities(G, resolution=1.0)`.
*Output:* write `cluster_id` on each member + one row in `clusters`.
*Scale:* With 5–10 users and <50 k messages this completes in <2 s.

---

## Embedding model choice GGUF vs PyTorch

* **PyTorch checkpoint** → runs on Hugging Face Inference Endpoints, vLLM, or Together AI.
---

## Final checklist

1. **Messages table schema** above.  Vector lives in `emb`.  All metrics in same row; simpler joins.
2. Embeddings right away; heavy metrics hourly.
3. Exhaustive attributes listed in schema.
4. Near-dupe check at insert; we are **not** pruning yet.
5. `msg_id` is the join key between vectors, metrics, KG, clusters.
6. Triples = semantic fact tuples; graph stored in `kg_nodes / kg_edges`; updated incrementally.
7. Louvain runs hourly; clusters stored; no need to recluster whole history each time—process only the changed subgraph.
8. Insights become ordinary `messages` rows (`role='introspection'`), pass through the same KG + metrics cycle.
9. Fine-tune pipeline described in Phase 5; yes, OpenAI hosted FT works and is cheap.
10. Full flow diagram given in phases.
11. Emotional relevance captured by `excitement` column; weight it in `priority`.

---