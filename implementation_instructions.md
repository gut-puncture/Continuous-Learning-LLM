## Global context - READ THIS FIRST

* **Product name:** *Mini-CLM*
* **Tech stack:**

  * Frontend — Next.js 15, React 19, shadcn/ui, Tailwind CSS, TypeScript.
  * Backend — Node 20 Fastify, TypeScript, `ai`-sdk for streaming GPT 4o.
  * Database — Heroku Postgres (Mini dyno) + `pgvector` extension.
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

| name                   | where used | value                               |
| ---------------------- | ---------- | ----------------------------------- |
| `OPENAI_API_KEY`       | backend    | your secret                         |
| `DATABASE_URL`         | backend    | set by Heroku                       |
| `GOOGLE_CLIENT_ID`     | frontend   | OAuth                               |
| `GOOGLE_CLIENT_SECRET` | frontend   | OAuth                               |
| `NEXTAUTH_SECRET`      | frontend   | random 32 bytes                     |
| `BACKEND_URL`          | frontend   | https\://<heroku-app>.herokuapp.com |

---

CURRENTLY IMPLEMENTING THIS:

# PHASE 0 Repo + infra bootstrap

### Objective

Create a compilable monorepo with CI/CD pipelines, a live Postgres with `pgvector`, and two blank apps that both deploy (even if they only say “hello world”).

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
2. `heroku addons:create heroku-postgresql:mini`.
3. `heroku psql -c "CREATE EXTENSION IF NOT EXISTS vector;"`.
4. I'll give you the details, you then copy `DATABASE_URL` into Heroku config & GitHub secrets.

---

### 0.4 Empty Next.js & Fastify apps

> **Task 0.4A – Next.js stub**
> • Create `/apps/frontend` using `npx create-next-app@latest --ts --tailwind`.
> • Delete boilerplate; render a single `<ChatPage />` that shows “Chat coming soon”.
> • Configure `next.config.js` with `output: "standalone"`.
> • Add Vercel `vercel.json` with build & output.
>
> **Task 0.4B – Fastify stub**
> • `/apps/backend` with Fastify v4, ESM, TypeScript, nodemon script.
> • Export `/healthz` route returning `{ok:true}`.
> • Add `Procfile` → `web: pnpm start`.
