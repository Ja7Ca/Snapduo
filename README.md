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
- http://localhost:8787/health returns `{"ok":true,"protocol":2}`

## Project layout

```
apps/web/src
├── app/[lang]/          pages: / (landing), /about, /r/[roomId], /p/[id], /dev/states
├── app/                 icons, manifest, robots.txt, sitemap.xml, /og/{id,en}.png
├── proxy.ts             language routing (see i18n/routing.ts)
├── i18n/                dictionaries (id, en), routing rules, helpers
├── components/ui/       shadcn components, themed to Snapduo tokens
├── components/booth/    VideoTile, ShutterButton, FramePicker, PhotoSlots, InviteCard…
├── components/photo/    PhotoStrip (frame renderer), FilterRow
└── features/
    ├── frames/          frame specs (slots, print sizes) + filters, unit-tested
    ├── room/            live session (socket, peer, capture, photos), view mapping + screens
    ├── media/           camera/mic hook with permission states
    └── mock/            placeholder photos for /dev/states
```

```
apps/signal/src          Worker: CORS/origins, POST /rooms, GET /rooms/:id, TURN, RoomObject (Durable Object)
packages/protocol/src    messages, timing, frame ids, and room-core: the room rules as pure functions
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

## How a room works (Phase 2)

- **The server decides.** Each room is a Durable Object holding the room state (frame, timer, photo slots, who is in which seat) in storage. Browsers send requests ("change frame", "start"), the object checks them against `room-core` in `packages/protocol` and sends the new snapshot to both. Two people pressing at once can't start two captures.
- **Seats survive reloads.** Joining returns a secret seat token kept in `sessionStorage`. Reload, a phone killing the tab, or a dropped network: the seat is held for 2 minutes and the token gets it back. Opening the same seat in a second tab moves it there ("Use it here" moves it back). **Leave** frees the seat at once.
- **Synced countdown.** The server picks the start time on its own clock; each browser measures its clock offset (`features/room/clock.ts`) and fires the shutter at the same moment.
- **Photos stay on the device.** They are kept in IndexedDB per room (deleted after 24 h), so a reload doesn't lose them. Your half comes from your camera at full resolution; your friend's half is a frame of their live video until Phase 3 sends their own sharp photo.
- **Video goes peer to peer.** One `RTCPeerConnection` per pair of seat "epochs": when either person reconnects, both sides start a fresh connection.

Add `?debug=1` to a room link for connection details (socket, seat, clock offset, `host`/`srflx`/`relay` path, bitrate); `&relay=1` forces TURN.

Testing on phones needs HTTPS, so use the deployed site + deployed Worker:

```bash
# once
pnpm --filter @snapduo/signal exec wrangler login
pnpm --filter @snapduo/signal exec wrangler secret put TURN_KEY_ID
pnpm --filter @snapduo/signal exec wrangler secret put TURN_KEY_API_TOKEN
```

TURN locally: copy `apps/signal/.dev.vars.example` to `apps/signal/.dev.vars` and fill it in (without it, STUN only).

`ALLOWED_ORIGINS` in `apps/signal/wrangler.jsonc` lists the sites allowed to use the Worker. `*` stands for one DNS label, which lets every Vercel branch preview (`snapduo-git-<branch>-ja7ca.vercel.app`) in.

In Vercel, set `NEXT_PUBLIC_SIGNAL_URL` to the Worker URL for **Production and Preview**.

`/dev/states` lists every room screen with mock data for quick visual checks. It returns 404 in production builds unless built with `SNAPDUO_DEV_STATES=1`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev:web` / `pnpm dev:signal` | Run each app locally |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests (protocol rules, room view mapping, frames, i18n, routing, SEO files, theme) and Worker tests in the Workers runtime |
| `pnpm build:web` | Production build of the web app |
| `pnpm deploy:signal` | Deploy the Worker (needs `wrangler login`) |

After changing bindings in `apps/signal/wrangler.jsonc`, run `pnpm --filter @snapduo/signal cf-typegen`.

## Protocol changes

Bump `PROTOCOL_VERSION` in `packages/protocol` on breaking changes, and deploy `apps/signal` before `apps/web`.

## Design

UI references from Google Stitch live in `docs/design/`. Colors and fonts in code are the source of truth.
