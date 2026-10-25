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

## Phase 0 — connection spike

`/spike` is a deliberately ugly test page: two devices join the same room and should see and hear each other.

1. TURN key (optional locally, required for the mobile test): copy `apps/signal/.dev.vars.example` to `apps/signal/.dev.vars` and fill in `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` from Cloudflare Realtime → TURN.
2. Run both apps, open http://localhost:3000/spike, press **join**, then open the copied link in a second tab.
3. The debug panel shows the path in use: `host` (same network), `srflx` (direct over the internet) or `relay` (through TURN). Tick **force relay** before joining to prove TURN works.

Testing on phones needs HTTPS, so use the deployed Vercel URL + deployed Worker:

```bash
# once
pnpm --filter @snapduo/signal exec wrangler login
pnpm --filter @snapduo/signal exec wrangler secret put TURN_KEY_ID
pnpm --filter @snapduo/signal exec wrangler secret put TURN_KEY_API_TOKEN
# add your Vercel URL to ALLOWED_ORIGINS in apps/signal/wrangler.jsonc, then
pnpm deploy:signal
```

In Vercel, set `NEXT_PUBLIC_SIGNAL_URL` to the Worker URL (`https://snapduo-signal.<account>.workers.dev`) and redeploy.

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
