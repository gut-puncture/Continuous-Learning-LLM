## Global context - READ THIS FIRST

* **Product name:** *Mini-CLM*
* **Tech stack:**

  * Frontend — Next.js 15, React 19, shadcn/ui, Tailwind CSS, TypeScript.
  * Backend — Node 22 Fastify v5, TypeScript, OpenAI SDK (direct, non-streaming).
  * Database — Heroku Postgres (Essential-0 plan) + `pgvector` extension.
  * Auth — NextAuth.js with Google OAuth.
  * Deployment:

    * Frontend → Vercel prod & preview envs.
    * Backend & cron workers → Heroku.
  * Package manager: pnpm 9.
* **Repo style:** Turborepo (monorepo) with workspaces:

```
/apps/frontend        → Next.js app
/apps/backend         → Fastify server
/packages/db          → drizzle-orm schema & migrations
/packages/config      → shared ts-config & eslint
```

* **Environment variables (initial):**

| name                        | where used | value                               |
| --------------------------- | ---------- | ----------------------------------- |
| `OPENAI_API_KEY`            | backend    | your secret                         |
| `DATABASE_URL`              | backend    | set by Heroku                       |
| `GOOGLE_CLIENT_ID`          | frontend   | OAuth                               |
| `GOOGLE_CLIENT_SECRET`      | frontend   | OAuth                               |
| `NEXTAUTH_SECRET`           | frontend   | random 32 bytes                     |
| `NEXT_PUBLIC_BACKEND_URL`   | frontend   | https\://<heroku-app>.herokuapp.com |
| `FRONTEND_URL`              | backend    | https\://<vercel-app>.vercel.app    |

---

CURRENTLY IMPLEMENTING THIS:


## 0  Shared assumptions

| Item                  | Value                                                                                                          | Source / comment |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| Primary DB            | Heroku Postgres 15, `pgvector` extension enabled                                                               |                  |
| Embedding model       | `text-embedding-3-large` (3072-d) from OpenAI                                                |                  |
| Chat LLM              | `gpt-4o-2024-08-06` for generation; `gpt-4o-mini-2024-07-18` for cheap classification tasks                                   |                  |
| Frontend              | Next.js 15 on Vercel (already live)                                                                            |                  |
| Backend               | Fastify + TypeScript (already live)                                                                            |                  |
| Dedup cadence         | Every **10 min**, but **only if** new messages have arrived since the last pass (triggered by Vercel cron job) |                  |
| No pruning / deletion | All rows stay in `messages`                                                                         |                  |
| Retrieval prompt      | A *fixed* system prompt string stored in ENV (`SYSTEM_PROMPT`) and prepended to every chat completion          |                  |

---

## 1  Phase 2 Embeddings & Retrieval  ❰1 day❱

### 1.1  Table changes (single migration)

```sql
-- If not present already
create extension if not exists vector;

alter table messages
  add column if not exists emb         vector(3072),
  add column if not exists embed_ready boolean default false;
```

### 1.2  “Store-then-embed” pipeline (**MUST NOT BLOCK UI**)

1. **API flow** in `/chat` route

   ```text
   a. INSERT new row (role='user') → return `msg_id` to caller
   b. enqueue “embed” job with { msg_id, content }
   c. respond HTTP 202 to frontend so it can optimistically render
   ```
2. **Embed worker** (`/jobs/embed.ts`)

   * Use OpenAI `embeddings.create({model:'text-embedding-3-large', input:content})`
   * Retry with exponential back-off up to 3 times. If that fails, fill the embed_ready column with couldn't get embedding or similar flag.
   * `UPDATE messages SET emb=$1, embed_ready=true WHERE msg_id=$2`

### 1.3  Retrieval function (`/lib/retrieve.ts`)

   * Each retrieval should only consider the messages which are not in the current thread.
   * Each retrieval should consider cosine similarity and calculated priority scores for messages.
   * If a message doesn't have a priority score, it shouldn't be retrieved.
   * Only memories which are above a certain threshold in the similarity + priority score should be retrieved and appended before the user messages.
   

### 1.4  Chat-completion call
   * We need to add a static system prompt in front of every thread.
   * For every message, we should retrive the relevant memories and append them in from of the user message. The logic is mentioned in the above section.

THIS IS JUST A SUGGESTION AND IS ONLY FOR ILLUSTRATION. WRITE CALL AS PER OUR CODE AND UP TO DATE DOCS.

```ts
const context = retrieve(…);
openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role:'system', content: process.env.SYSTEM_PROMPT },
    ...context.map(m => ({role:'system', content:`<memory id="${m.msg_id}">${m.content}</memory>`})),
    ...threadSoFar,
    { role:'user', content: userMessage }
  ],
  stream:true
})
```

---

## 2  Phase 3 Background Intelligence Layer  ❰3 days❱

Everything runs in **three cron workers** to keep memory low.
All jobs read the *delta* since their previous run.

### 2.1  Job A – “Metrics + KG + Dedup” (called every 10 min)

| Sub-task                          | Details                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Load batch**                    | `SELECT * FROM messages WHERE created_at > last_run_ts AND embed_ready=true`                                                                     |
| **Sentiment**                     | Call `gpt-4o-mini-2024-07-18` with *system*: “Return an integer –5 to +5 for sentiment of the text”; store in `sentiment`. Extremely negative emotion, anger, fear, despair gets -5, Neutral statement of fact gets 0 and Highly positive emotion, joy, gratitude, praise gets +5.                          |
| **Excitement** (emotional weight) | Same model, 0–1 scale (“boring” 0 → “exciting” 1).                                                                                               |
| **Helpfulness**                   | Prompt: “For a future self who revisits this conversation, how helpful is the information (0–1)?”                                                |
| **Novelty**                       | `1 – MAX(cosine)` against previous 500 messages from the same use (pgvector).                                                                                      |
| **Triple extraction**             | Prompt `gpt-4o-mini-2024-07-18`: “SYSTEM: Extract up to 3 factual (subject, relation, object) triples from the text.
Return JSON list [{"s":"", "p":"", "o":""}]. Use canonical names if possible.”.                                                  |
| **KG merge**                      | For each triple: `INSERT ... ON CONFLICT (label) DO NOTHING` into `kg_nodes`; same for `kg_edges` with `weight = weight + 1`.                    |
| **Centrality (edge-level)**       | Keep a rolling degree centrality per `kg_node` in a side table; update counts incrementally (no full graph yet).                                 |
| **Priority compute**              | `priority = 0.7*novelty + 0.3*excitement + 0.2*helpfulness + 0.2*centrality_normalised + 0.1*ABS(Sentiment)` (weights editable ENV).                                  |
| **Near-duplicate pass**           | This wil happen every 10 Minutes if there are any new messages. For any two messages within batch whose cosine > 0.97 *and* same user → set `duplicate_of`, copy metrics from the survivor.  Deduplication will only run on messages from the same user, meaning different deduplication exercises for each user.                    |

### 2.1  Job A Knowledge-graph construction (still Job A)
Triple extraction:

   * Prompt:
Extract up to three factual triples in JSON with keys "s", "p", "o". Use real entity names, not pronouns. Return "[]" if no factual content.
Example output:
[{"s":"Alice","p":"works_at","o":"ACME Corp"},{"s":"Project Beta","p":"deadline","o":"2024-12-31"}]

   * Canonicalisation rules:

Lower-case and trim whitespace.

Apply a small synonym dictionary (e.g., “wife” → “spouse”).

If the synonym lookup fails, compute the embedding of the candidate label; if its cosine distance from an existing node label’s embedding is less than 0.15, treat them as the same node.

Otherwise create a fresh node.

   * Merging:

For every triple, upsert the subject node, upsert the object node, then upsert or increment the edge connecting them.

Increment a simple integer degree on each node touched.

Map the current msg_id to every node it references via a msg_to_node link.

4. Provisional centrality and priority (Job A continued)
Degree centrality for a message is the arithmetic mean of the degree values on all of its nodes.

Provisional priority formula:
0.30 × novelty + 0.20 × excitement + 0.20 × helpfulness + 0.20 × degree_centrality + 0.10 × ABS(sentiment)
Write this to messages.priority.

### 2.1.1 Job A-2
Every 10 minutes we should run de-duplication on all the user's messages. A message should be compared with all non-duplicate user messages. If a message is deemed as duplicate (cosine similarity > 0.97), the later message will be marked duplicate and never used beyond that point.
This job should only run if there have been any new messages from any user.
For any message, this job should run first, before the hourly clustering or fine-tuning jobs.


### 2.2  Job B – “Hourly Graph & Clustering”

   * Similarity graph overview
Build an in-memory graph whose nodes are messages created since the previous run plus their nearest neighbours:

For each new message, select its 20 nearest neighbours (same user scope) whose cosine distance is below 0.15.

Create an undirected edge with weight 1 – cosine_distance.

Run Louvain community detection (python-louvain):

The algorithm returns a partition mapping message IDs to cluster IDs.

Insert new cluster memberships:

For each mapping, upsert (cluster_id, msg_id) into cluster_members.

Cluster naming (mandatory new task):

For any cluster ID not yet present in the clusters table:

Take the text of the first ten messages in that cluster.

Prompt GPT-4o:
Read the following messages. Provide a short descriptive title in **no more than eight words** that captures the shared theme. Respond with the title only.

Store the returned title in clusters.cluster_name.

| Step                        | Library                                                                                                         | Notes |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| Build similarity graph      | SQL: edges where `(emb <-> emb) < 0.15` (top-k per msg)                                                         |       |
| Convert to NetworkX graph   | `nx.Graph()`                                                                                                    |       |
| Run **Louvain**             | `python-louvain` (`community_louvain.best_partition(G)`)                                                        |       |
| Write clusters              | Insert/Update `clusters` and `cluster_members`; update `messages.cluster_id`                                    |       |
| Update **graph centrality** | `nx.eigenvector_centrality()` over the KG built in Job A; write back to `messages.centrality` (normalised 0–1). |       |

**Why the KG again?**
This full pass produces *global* centrality which is slower than the incremental degree but more accurate—hence only hourly.

   * Final eigenvector centrality and priority overwrite (still Job B)
Using NetworkX, compute eigenvector centrality on the entire knowledge graph that exists after the latest triple merges.

For each node, save the resulting float into kg_nodes.eig_cent.

For each message, compute the mean of eig_cent across its nodes. Write that to messages.centrality, overwriting the earlier degree-based estimate.

Recalculate priority with the same coefficients but using the new centrality value; write back to messages.priority, overwriting the provisional figure.

### 2.3  Job C – “Daily Insights & Fine-tune Prep”

   * Overview
Select the 1 000 messages from the last 24 h with the highest priority values.

Group them by cluster_id.

For each group:

Build a prompt:
You will summarise these messages and produce ONE concise insight. Also craft a single user-style question that the insight answers. Output a JSON object with keys "insight" and "question" and an array "evidence_ids" listing message IDs you used.

Use "o4-mini-2025-04-16" for richer reasoning.

Insert the insight as a new messages row (role='introspection'), set embed_ready=false so it passes through the embed worker next cycle.

Assemble the auto-generated question–answer pairs into NDJSON.

Call OpenAI fine-tuning endpoint (model='gpt-4o-2024-08-06') with the NDJSON file.

When the operation reports status='succeeded', store the resulting model_id in a metadata table.

POST that model ID to a tiny Vercel API route that updates an environment variable on the frontend so the next chat call uses the fine-tuned model.

| Stage             | Action                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gather            | Top 1 000 messages by `priority` in the last 24 h.                                                                                                                 |
| Cluster summaries | For each `cluster_id` call GPT-4o: “Summarise cluster X in <200 words> and propose one insight.”                                                                   |
| Insight JSON      | Model replies with `{insight, evidence_ids[]}`.                                                                                                                    |
| Persist           | Insert a new `messages` row (`role='introspection'`) per insight; mark `embed_ready=false` so Job A embeds it on next tick.                                        |
| Fine-tune file    | For each insight create:<br>`USER: {{auto-question}}\nASSISTANT: {{insight}}` (auto-question generated in same call). Store NDJSON in `/tmp/ft.jsonl`.             |
| Upload            | Call OpenAI *fine-tunes.create* (`model='gpt-4o-mini'`).  Capture new `ft_model` id and POST to Vercel `/api/set-model-id` so live chat uses the fresh checkpoint. |

---

## 3  Detailed metric definitions (feed verbatim to the coder LLM)

| Metric          | Semantics                                                           | Extraction prompt snippet                          |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| **sentiment**   | −5 very negative → +5 very positive                                 | “Return only an integer between –5 and +5.”        |
| **excitement**  | 0 dull fact • 1 breaking, emotionally charged                       | “Rate 0 (not exciting) … 1 (very exciting).”       |
| **helpfulness** | 0 irrelevant • 1 directly actionable fact                           | “How helpful will this be to the same user later?” |
| **topic**       | One label from *Finance, Coding, Planning, Personal, Entertainment* | “Return exactly one topic from the list.”          |

---

## 4  System prompt template (retrieval aware)

```txt
You are MemoryGPT, an assistant with long-term memory.
<rules>
1. You may cite memories by id with the syntax [mem123].
2. If the answer is not in memory and you are unsure, say so honestly.
</rules>
```

Store as `SYSTEM_PROMPT` env-var; prepend to every completion call (see §1.4).

---

## 5  Decisions still open (Model must take final decision)

| Decision                            | Default in spec                                    | Change if you wish            |
| ----------------------------------- | -------------------------------------------------- | ----------------------------- |
| Similarity threshold for clustering | `emb <-> emb < 0.15`                               | AI must change if needed to change graph density  |
| Louvain resolution                  | `1.0`                                              | AI can Increase >1 for more clusters |



ALREADY IMPLEMENTED

# PHASE 0 Repo + infra bootstrap

### Objective

Create a compilable monorepo with CI/CD pipelines, a live Postgres with `pgvector`, and two blank apps that both deploy (even if they only say "hello world").

---

### 0.1 Scaffold the monorepo

> **Task 0.1** Create a Turborepo monorepo skeleton.
> • Use `pnpm create turbo@latest mini-clm --no-git`.
> • Configure workspaces exactly as listed in the directory layout above.
> • Provide `package.json` workspaces block and root `turbo.json` with a `build` and `dev` pipeline.
> • Add a reusable `@mini-clm/eslint-config` in `/packages/config`.

I will then commit, push to GitHub.

---

### 0.2 Add CI workflows

> **Task 0.2** Generate two GitHub Action workflows (`ci.yml`, `release.yml`).
>
> * `ci.yml` on every push:  `pnpm install`,   `pnpm turbo build`,  run eslint.
> * `release.yml` on push to `main`: deploy backend to **Heroku** using `akhileshns/heroku-deploy@v4` and frontend to **Vercel** using `amondnet/vercel-action@v25`.
> * Mask secrets `${{ secrets.HEROKU_API_KEY }}` & `${{ secrets.VERCEL_TOKEN }}`.

I'll add those repo secrets.

---

### 0.3 Provision database

1. `heroku create mini-clm-backend`.
2. `heroku addons:create heroku-postgresql:essential-0` (Note: mini plan is no longer available).
3. `heroku pg:psql --app mini-clm-backend -c "CREATE EXTENSION IF NOT EXISTS vector;"`.
4. I'll give you the details, you then copy `DATABASE_URL` into Heroku config & GitHub secrets.

---

### 0.4 Empty Next.js & Fastify apps

> **Task 0.4A – Next.js stub**
> • Create `/apps/frontend` using `npx create-next-app@latest --ts --tailwind`.
> • Delete boilerplate; render a single `<ChatPage />` that shows "Chat coming soon".
> • Configure `next.config.js` with `output: "standalone"`.
> • Add Vercel `vercel.json` with build & output.
>
> **Task 0.4B – Fastify stub**
> • `/apps/backend` with Fastify v5, ESM, TypeScript, nodemon script.
> • Export `/healthz` route returning `{ok:true}`.
> • Add `Procfile` → `web: pnpm start`.

# PHASE 1 Bare-bones chat & auth

### Goal

End-to-end chat: user logs in with Google, types a message, backend relays it to GPT-4o, response returns (non-streaming).

---

### 1.1 Google OAuth & NextAuth

> **Task 1.1**
> Implement NextAuth in `/apps/frontend`.
> • Provider: Google. Use env vars.
> • Session: JWT, 30-day expiry.
> • Expose a React hook `useUser()` in `src/hooks/useUser.tsx`.
> • Protect `/chat` route: redirect to `/api/auth/signin` if unauthenticated.
> • Show user avatar + sign-out button in header.

---

### 1.2 Chat UI component

> **Task 1.2**
> Build `<Chat />` component with shadcn/ui.
> • Input textarea, send on `Enter`.
> • Message list shows bubbles L= assistant, R = user.
> • Messages use simple request-response (no streaming).
> • Updated to call backend directly via `process.env.NEXT_PUBLIC_BACKEND_URL`.
> • Maintain `threadId` in React state.

---

### 1.3 Backend `/chat` & `/history` routes ✅ COMPLETED

> **Task 1.3**
> In Fastify v5:
> • `POST /chat` body `{userId, threadId?, content}`
> – Call OpenAI chat completion (model `gpt-4o-2024-08-06`) **stream = false**.
> – Generate threadId if not provided and return it in response.
> – Fetch full conversation history and include in OpenAI request for context.
> – Insert user message, await full OpenAI response, then insert assistant message.
> – Return `{threadId, assistant: {content, tokenCnt}}`.
> • `GET /history/:threadId` returns all messages for a thread.
> • CORS configured for `process.env.FRONTEND_URL`.

**COMPLETED:** Backend implementation with non-streaming OpenAI chat completion, full conversation context, database persistence, and proper error handling.

---

### 1.4 DB "messages" table migration


> **Task 1.4**
> Using Drizzle ORM, generate a migration that creates
>
> ```ts
> messages (
>   msg_id      bigserial primary key,
>   user_id     uuid not null,
>   thread_id   uuid not null,
>   role        text check (role in ('user','assistant')),
>   created_at  timestamptz default now(),
>   content     text,
>   token_cnt   int
> )
> ```
>
> Add helper `insertMessage({})` and `getThreadMessages(threadId)`.

**COMPLETED:** Database schema implemented with Drizzle ORM, migration generated, and helper functions created.

---

### 1.5 Chat history sidebar

*This has been changed to a sidebar implementation*

> **Task 1.5**
> Create `/history` route (protected).
> • Query `SELECT DISTINCT thread_id, max(created_at) ...` to list conversations.
> • Clicking an item navigates to `/chat?threadId=…` and loads previous messages via `/api/history/:threadId`.


#Implementation Notes of Developer

llm_instructions = """
The task details are given in the implementation instructions file.

First understand the existing codebase so you get how everything is setup. I recommend looking at the repo structure and reading the files. Also, remember that "/Users/Shailesh/Applications/Cursor/CLM_self_coded/" is the root folder. Also, please remember what we have done and the code we have and how the new changes will affect the existing code. Feel free to create tasks to update the existing code if needed.

We want to implement phase 2 and I recommend reading phase 2 and 3 details first. Plan first WITHOUT writing ANY code and ask me questions if you have any. Then we'll write the code.
"""

# Features to implement
1. What happens if a user who is not signed up comes to the website and starts chatting? We shouldn't allow this ideally because every other handling is tedious. But what is happening right now?
2. We need to somehow tackle the "heartbeat" polling

# Bugs
1. no way to edit chat names
2. novelty always being 1.
3. 





## **Background & Context**

- **Mini-CLM** is a chat application with long-term memory, knowledge graph, and advanced message metrics.
- **Phase 2**: Embeddings, retrieval, and OpenAI integration are complete and deployed.
- **Phase 3 (Job A)**: Job A worker processes each message for embeddings, metrics (sentiment, excitement, helpfulness, novelty, centrality), and knowledge graph (KG) triple extraction and canonicalization.
- **Current Stack**: Next.js (Vercel), Fastify (Heroku), PostgreSQL (pgvector), Redis (BullMQ), OpenAI (embeddings + 4o-mini for metrics).

---

## **Job A-2: Deduplication, Clustering, and Centrality**
- **Resources**: this will work in a new worker dyno which must be a hobby dyno with max $7/mo cost
### **Purpose**
- **Deduplicate** similar/identical messages to avoid redundant KG nodes and metrics.
- **Cluster** semantically similar messages for better knowledge organization.
- **Calculate centrality** for each message/node in the knowledge graph.

### **Implementation Details**

#### 1. **Deduplication**
- **Trigger**: After Job A finishes processing a message.
- **Logic**:
  - For each new message, compare its embedding to the last N (e.g., 500) messages from the same user.
  - If cosine similarity > threshold (e.g., 0.97), mark as duplicate.
  - Update `duplicate_of` column in `messages` table with the msg_id of the canonical/original message.
  - Set `dedup_ready = true` when deduplication is complete.
- **Database**:
  - `messages` table: `duplicate_of`, `dedup_ready` columns.
- **Edge Cases**:
  - If a message is a duplicate, skip further KG/metrics processing for it.
  - If not, proceed to clustering.

#### 2. **Clustering**
- **Trigger**: After deduplication. Only use messages which are not duplicates.
- **Logic**:
  - Build a message similarity graph which will be stored in our database by taking each message as a node. A separate graph for each user needs to be created.
  - Use embeddings to select the 20 top messages from the same user which have the highest cosine similarity with a new message. Connect the new message with each of these messages in the graph.
  - Run Louvain community detection (python-louvain) to cluster messages on the entire graph which now should have the new messages as well. 
  - For each mapping, upsert (cluster_id, msg_id) into cluster_members.
- **Database**:
  - `messages` table: `cluster_id` column.
  - `cluster_members` table: (cluster_id, msg_id).
- **Edge Cases**:
  - Handle messages that don’t fit any cluster (singleton clusters) by giving them their own cluster ids.
  - Allow for cluster merging/splitting as new data arrives.
  - For users sending the first message the graph should get created with the first few messages and clustering should occur without errors.

#### 3. **Centrality Calculation**
- **Trigger**: After clustering.
- **Logic**:
  - For each KG node which has been added since the last time the job ran, calculate eigenvector centrality.
  - Centrality reflects how “important” or “connected” a node/message is in the knowledge graph.
  - Update `centrality` column in `messages` and/or `kg_nodes` table.
  - Recalculate priority of each message for which the new eigenvector centrality has been calculated.
- **Database**:
  - `messages` table: `centrality` column.
  - `kg_nodes` table: `centrality` column (if needed).
- **Edge Cases**:
  - Recalculate centrality when KG structure changes (new nodes/edges, merges, etc.).

#### 4. **Job Queue Integration**
- **JobA-2** should be a separate BullMQ job, triggered after JobA completes.
- Ensure idempotency: re-running the job should not corrupt data.
- Add logging and error handling for all steps.

---

## **Job 2: Summarization and Cluster Labeling**

### **Purpose**
- Generate human-readable summaries for each cluster of messages.
- Label clusters for easier navigation and search.

### **Implementation Details**

#### 1. **Cluster Summarization**
- **Trigger**: After clustering is complete (JobA-2).
- **Logic**:
  - For each cluster, gather all messages (or a sample).
  - Use OpenAI (e.g., GPT-4o) to generate a concise summary of the cluster’s main idea(s).
  - Store the summary in a new `summary` column in the `clusters` table.
- **Database**:
  - `clusters` table: `cluster_id`, `summary`, `label`, `created_at`, `updated_at`.
- **Edge Cases**:
  - For very large clusters, sample representative messages.
  - For singleton clusters, summary = message content.

#### 2. **Cluster Labeling**
- **Trigger**: After summarization.
- **Logic**:
  - Use OpenAI to generate a short label/title for each cluster (e.g., “Travel Memories”, “Work Advice”).
  - Store in `label` column in `clusters` table.
- **Database**:
  - `clusters` table: `label`.
- **Edge Cases**:
  - If label is too generic or empty, retry or fallback to summary.

#### 3. **Job Queue Integration**
- **Job 2** should be a BullMQ job, triggered after JobA-2 finishes for a cluster.
- Ensure jobs are not duplicated for the same cluster.
- Add logging and error handling.

---

## **Job 3: User-Facing Features & Search**

### **Purpose**
- Expose deduplication, clustering, and summarization results to the user.
- Enable advanced search, navigation, and visualization of memories and knowledge.

### **Implementation Details**

#### 1. **Cluster Browsing UI**
- **Frontend**:
  - Add a “Clusters” or “Topics” tab/page.
  - List all clusters for the user, showing label and summary.
  - Clicking a cluster shows all member messages and their details (metrics, KG links, etc.).
- **Backend**:
  - New API endpoints:
    - `GET /clusters/:userId` — list clusters for a user.
    - `GET /clusters/:clusterId` — get details, summary, and messages for a cluster.
    - `GET /messages/:msgId` — get full message details, including dedup info, metrics, KG links.
- **Database**:
  - Use `clusters`, `cluster_members`, `messages`, and KG tables.

#### 2. **Deduplication & Canonicalization in UI**
- **Frontend**:
  - Indicate when a message is a duplicate (e.g., “This is a duplicate of message X”).
  - Option to view the canonical/original message.
- **Backend**:
  - API returns `duplicate_of` and canonical message info.

#### 3. **Advanced Search**
- **Frontend**:
  - Add search bar for messages, clusters, and KG nodes.
  - Support search by content, label, summary, or metrics (e.g., “show me all excited messages about travel”).
- **Backend**:
  - API endpoint for search, leveraging pgvector for semantic search and filters for metrics/labels.

#### 4. **Knowledge Graph Visualization**
- **Frontend**:
  - Visualize the user’s knowledge graph (nodes = concepts, edges = relationships).
  - Allow clicking nodes to see related messages/clusters.
- **Backend**:
  - API endpoint to fetch KG nodes/edges for visualization.

#### 5. **Metrics & Insights**
- **Frontend**:
  - Show aggregate metrics for clusters (average excitement, helpfulness, etc.).
  - Highlight most “novel” or “central” memories.
- **Backend**:
  - API endpoints to fetch metrics per cluster/message.

#### 6. **Background Job Monitoring**
- **Admin/Dev Only**:
  - UI or CLI to view job queue status, failed jobs, and logs for JobA, JobA-2, Job2, Job3.

---

## **General Requirements & Best Practices**

- **Idempotency:** All jobs should be safe to re-run.
- **Error Handling:** Log and alert on failures; retry jobs as needed.
- **Performance:** Use batch processing for clustering and summarization to avoid timeouts.
- **Security:** Ensure all endpoints are authenticated and user data is isolated.
- **Scalability:** Design jobs to handle more users/messages in the future.
- **Documentation:** Document all endpoints, job flows, and data models.

---

## **Summary Table**

| Job      | Purpose                                   | Key Steps/Logic                                                                 | DB Tables/Columns Affected                | API/Frontend Impact                |
|----------|-------------------------------------------|----------------------------------------------------------------------------------|-------------------------------------------|------------------------------------|
| JobA-2   | Deduplication, Clustering, Centrality     | Embedding similarity, cluster assignment, centrality calculation                  | messages, cluster_members, kg_nodes       | None (background)                  |
| Job 2    | Summarization & Cluster Labeling          | Summarize cluster, generate label using OpenAI                                   | clusters, cluster_members                 | Cluster summaries/labels in UI     |
| Job 3    | User-Facing Features & Search             | Expose clusters, dedup info, search, KG viz, metrics in UI                       | All above                                 | New UI pages, search, KG viz       |

---

## **What to Check/Test After Deployment**

- **JobA-2:**  
  - Duplicates are detected and marked in DB.
  - Clusters are formed and cluster_members populated.
  - Centrality values are updated.
- **Job 2:**  
  - Each cluster has a summary and label.
- **Job 3:**  
  - UI shows clusters, summaries, dedup info, and KG visualization.
  - Search works for content, labels, and metrics.
- **All Jobs:**  
  - No errors in logs, jobs complete successfully, and data is correct in DB.

---

## **Conclusion**

This plan covers **every technical and product detail** for deploying and validating JobA-2, Job 2, and Job 3.  
**Nothing is omitted:**  
- All triggers, logic, edge cases, DB schema, API, and UI requirements are included.
- You can hand this to a developer or use it as a checklist for your own implementation and deployment.

If you need a more detailed breakdown of any specific job, data model, or API contract, just ask!
