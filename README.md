# Mini-CLM (Continuous Learning LLM)

A work in progress Continuous Learning LLM System.

## Tech Stack

- **Frontend:** Next.js 15, React 19, shadcn/ui, Tailwind CSS, TypeScript
- **Backend:** Node 22, Fastify v5, TypeScript, OpenAI SDK (direct, non-streaming)  
- **Database:** Heroku Postgres + `pgvector` extension
- **Auth:** NextAuth.js with Google OAuth
- **Deployment:** Frontend → Vercel, Backend & workers → Heroku
- **Package Manager:** pnpm 9
- **Monorepo:** Turborepo with workspaces

## Project Structure

```
/apps/frontend        → Next.js app
/apps/backend         → Fastify server  
/packages/db          → drizzle-orm schema & migrations
/packages/config      → shared ts-config & eslint
```

## Development

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Build all packages
pnpm build

# Lint all packages  
pnpm lint

# Type check all packages
pnpm check-types
```

## Environment Variables

See `implementation_instructions.md` for the complete list of required environment variables.
