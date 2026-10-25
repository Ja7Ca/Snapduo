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

- http://localhost:3000 shows the landing page (Indonesian); http://localhost:3000/en is English
- http://localhost:8787/health returns `{"ok":true,"protocol":1}`

## Project layout

```
apps/web/src
├── app/[lang]/          pages: / (landing), /about, /r/[roomId], /p/[id], /spike, /dev/states
├── app/                 icons, manifest, robots.txt, sitemap.xml, /og/{id,en}.png
├── proxy.ts             language routing (see i18n/routing.ts)
├── i18n/                dictionaries (id, en), routing rules, helpers
├── components/ui/       shadcn components, themed to Snapduo tokens
├── components/booth/    VideoTile, ShutterButton, FramePicker, PhotoSlots, InviteCard…
├── components/photo/    PhotoStrip (frame renderer), FilterRow
└── features/
    ├── frames/          frame specs (slots, print sizes) + filters, unit-tested
    ├── room/            room state reducer (unit-tested) + screens
    ├── media/           camera/mic hook with permission states
    └── mock/            Phase 1 placeholder photos
```

Design tokens live in `apps/web/src/app/globals.css` (light + dark). They are the source of truth; the Stitch exports in `docs/design/` are references only.

## Languages

Indonesian is the default and has no URL prefix; English lives under `/en`:

| URL | Language |
|---|---|
| `/`, `/about` | Indonesian |
| `/en`, `/en/about` | English |
| `/id/...` | 308 redirect to the unprefixed URL |
| `/r/<room>`, `/p/<id>` | no prefix: last language the visitor used (cookie `snapduo-lang`), else their browser language |

The home page is never redirected by browser language (search engines would only ever see one version). English-speaking visitors get a small "View in English" suggestion instead.

All text lives in `apps/web/src/i18n/dictionaries/`. `en.ts` defines the keys; `id.ts` must match it exactly (TypeScript and `i18n.test.ts` both check this, including `{placeholders}`).

## SEO

- Per-language `<title>`, description, canonical URL and `hreflang` links (id, en, x-default)
- Open Graph / Twitter images per language: `/og/id.png`, `/og/en.png`
- `sitemap.xml` (landing + about, both languages), `robots.txt` (rooms, shared photos and tools are blocked and also `noindex`)
- JSON-LD `WebApplication` on the landing page
- Canonical domain comes from `NEXT_PUBLIC_SITE_URL` (default `https://snapduo.ja7ca.web.id`)

After deploying:

1. **Vercel → Settings → Domains:** set `snapduo.ja7ca.web.id` as primary and make `snapduo.vercel.app` redirect to it (308), so search engines only see one site.
2. **Google Search Console:** add the domain and submit `https://snapduo.ja7ca.web.id/sitemap.xml`.
3. Check the share preview with the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) or by pasting the link in WhatsApp.

## Phase 1 — UI with a simulated friend

The room page uses your real camera but simulates the friend, so every screen can be tried alone. A **Preview** button (bottom left) plays the friend's part: drop out, come back, weak connection, press Done, and so on. Phase 2 replaces the simulation with real connections.

`/dev/states` lists every room screen with mock data for quick visual checks. It returns 404 in production builds unless built with `SNAPDUO_DEV_STATES=1`.

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
| `pnpm test` | Unit tests (frames, room state, room ids, i18n, routing, SEO files, theme) |
| `pnpm build:web` | Production build of the web app |
| `pnpm deploy:signal` | Deploy the Worker (needs `wrangler login`) |

After changing bindings in `apps/signal/wrangler.jsonc`, run `pnpm --filter @snapduo/signal cf-typegen`.

## Protocol changes

Bump `PROTOCOL_VERSION` in `packages/protocol` on breaking changes, and deploy `apps/signal` before `apps/web`.

## Design

UI references from Google Stitch live in `docs/design/`. Colors and fonts in code are the source of truth.
