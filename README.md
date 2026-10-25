# Snapduo

Online photobooth for two people in different places: create a room, share the link, see and hear each other, and take a synced photo strip together.

## Stack

| Part | Tech | Deploy |
|---|---|---|
| `apps/web` | Next.js (App Router) + Tailwind | Vercel (Root Directory = `apps/web`) |
| `apps/signal` | Cloudflare Worker + Durable Object (one object per room) | Cloudflare (`wrangler deploy`) |
| `packages/protocol` | Shared message types between web and signal | — |

Video and audio go peer-to-peer over WebRTC. The Worker only handles signaling and room state. TURN comes from Cloudflare Realtime.

## Requirements

- Node.js 22+ (see `.nvmrc`)
- pnpm 10 (`corepack enable` then `corepack prepare pnpm@10.28.0 --activate`)

## Getting started

```bash
pnpm install

# terminal 1 — signaling Worker on http://localhost:8787
pnpm dev:signal

# terminal 2 — web app on http://localhost:3000
cp apps/web/.env.example apps/web/.env.local
pnpm dev:web
```

Smoke checks:

- http://localhost:3000 shows "Scaffold OK · protocol v1"
- http://localhost:8787/health returns `{"ok":true,"protocol":1}`
- http://localhost:8787/rooms/test/ping returns `room alive (protocol v1)`

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev:web` / `pnpm dev:signal` | Run each app locally |
| `pnpm typecheck` | Type-check every package |
| `pnpm build:web` | Production build of the web app |
| `pnpm deploy:signal` | Deploy the Worker (needs `wrangler login`) |

After changing bindings in `apps/signal/wrangler.jsonc`, run `pnpm --filter @snapduo/signal cf-typegen`.

## Protocol changes

Bump `PROTOCOL_VERSION` in `packages/protocol` on breaking changes, and deploy `apps/signal` before `apps/web`.

## Design

UI references from Google Stitch live in `docs/design/`. Colors and fonts in code are the source of truth.
