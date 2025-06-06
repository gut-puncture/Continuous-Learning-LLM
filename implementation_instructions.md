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
## PHASE 1 Bare-bones chat & auth

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

### 1.5 Chat history page

**Prompt to GPT-4o**

> **Task 1.5**
> Create `/history` route (protected).
> • Query `SELECT DISTINCT thread_id, max(created_at) ...` to list conversations.
> • Clicking an item navigates to `/chat?threadId=…` and loads previous messages via `/api/history/:threadId`.




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




llm_instructions = """
The task details are given in the implementation instructions file.

First understand the existing codebase so you get how everything is setup. I recommend looking at the repo structure and reading the files. Also, remember that "/Users/Shailesh/Applications/Cursor/CLM_self_coded/" is the root folder. Also, please remember what we have done and the code we have and how the new changes will affect the existing code. Feel free to create tasks to update the existing code if needed.

We want to do resolve the bug with the disappearing messages. Plan first WITHOUT writing ANY code and ask me questions if you have any. Then we'll write the code.
"""

#Questions to answer
1. What happens if a user who is not signed up comes to the website and starts chatting? We shouldn't allow this ideally because every other handling is tedious. But what is happening right now?
2. there is no apps/frontend/src/app/history page. How do we handle past threads?

#Bugs
1. the thread id persists when you open the window again even when using the base URL.
2. Messages disappear immediately
3. no tables in heroku

