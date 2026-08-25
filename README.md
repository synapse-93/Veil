# SecureShare

Zero-knowledge share capsules with client-side encryption and a Risk Lens security posture view.

This repository is a pnpm + TypeScript monorepo. Application features are not implemented yet.

## Workspace

| Path | Package | Role |
| --- | --- | --- |
| `apps/frontend` | `@secureshare/frontend` | React + Vite client |
| `apps/backend` | `@secureshare/backend` | Node + Fastify API, Prisma + PostgreSQL |
| `packages/shared` | `@secureshare/shared` | Shared types, constants, Zod schemas |
| `cli` | `@secureshare/cli` | Command-line client |
| `tests/unit` | — | Vitest unit tests |
| `tests/integration` | — | Vitest integration tests |
| `tests/e2e` | — | Playwright end-to-end tests |

## Setup

```bash
pnpm install
pnpm typecheck
```

## Scripts

- `pnpm dev:frontend` — Vite dev server
- `pnpm dev:backend` — Fastify (scaffold only)
- `pnpm build` — build all packages that define a build script
- `pnpm typecheck` — TypeScript checks across the workspace
- `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e`

## Stack

TypeScript, pnpm workspaces, React, Vite, Fastify, PostgreSQL, Prisma, Zod, Tailwind CSS, Web Crypto API, PBKDF2-HMAC-SHA256, Vitest, Playwright.
