# Fase 2 — status (26 Okt 2026)

## Sudah jalan & teruji

**Protocol (`packages/protocol`)** — v2, breaking (deploy worker dulu).
- `room-core.ts`: aturan room sebagai fungsi murni (join/seat token, grace 120 dtk, leave, intent: frame/timer/capture/retake/finish/back/start-over/release-friend/mic, tick, alarm, expiry 24 jam). 23 unit test.
- `timing.ts`: jadwal capture bersama (`shutterAt`, `captureProgress`).
- `frames.ts`: id frame + jumlah foto (dites sinkron dengan `apps/web`).

**Worker (`apps/signal`)**
- `POST /rooms` (ID dibuat server), `GET /rooms/:id` (open/full/not_found), WS `/rooms/:id/ws?v=2`.
- RoomObject: state di storage (aman saat hibernasi), seat token, tab duplikat → yang lama ditutup (4003), Leave → kursi langsung kosong, socket diam > 40 dtk dianggap putus, alarm untuk grace & capture & bersih-bersih.
- `ALLOWED_ORIGINS` mendukung `*` untuk preview Vercel.
- 15 test integrasi di runtime Workers asli (`pnpm --filter @snapduo/signal test`).
- Bug yang ketemu & sudah diperbaiki: grace habis lewat alarm tidak dikirim ke teman.

**Web (`apps/web`)**
- `features/room/session.ts`: socket + reconnect otomatis (backoff, `online`, kembali ke tab), sinkron jam, peer connection per pasangan epoch, buffer signal awal, jadwal shutter, foto ke IndexedDB.
- `live-view.ts`: snapshot server → `RoomState` untuk view lama + aksi view → intent (unit test).
- Teman simulasi & tombol Preview dihapus; `/spike` dihapus. Debug: tambahkan `?debug=1` (dan `&relay=1` untuk paksa TURN).
- Layar baru: "Room terbuka di tab lain" (Pakai di sini) dan "Snapduo baru diperbarui" (Muat ulang).
- Tombol Buat room → `POST /rooms`.

**Hasil tes**
- Unit web 81/81, protocol 23/23, worker 15/15, typecheck + lint + build OK.
- E2E 2 browser vs `wrangler dev` (kamera palsu): **14/14 lulus, 3 kali berturut-turut** — join, video 2 arah, mute, ganti frame oleh teman, capture sinkron 2 foto, retake foto 2, Selesai → hasil → kembali ke booth, reload tab (kursi & foto kembali), orang ke-3 ditolak, link ngawur → not found, tab duplikat (tab lama mengalah, "Pakai di sini" mengambil lagi), offline 20 dtk lalu tersambung sendiri, Leave.
- Video tersambung 10/10 percobaan berturut-turut (sebelum perbaikan ±1 dari 4 macet).

## Bug yang ketemu lewat tes & sudah diperbaiki

1. Grace 2 menit habis lewat alarm tidak dikirim ke teman (worker).
2. Signal yang datang sebelum peer siap dibuang → video bisa macet. Sekarang di-buffer, dan kredensial TURN diambil saat halaman dibuka.
3. **Video macet ±25% (glare).** Dua sisi membuat offer bersamaan; di Chrome sisi "polite" setelah rollback kadang tidak mengirim ICE candidate. Sekarang hanya sisi impolite yang membuat offer pertama (dan ICE restart); sisi polite memasang track saat offer datang. (`lib/peer.ts`)
4. Teman yang putus diam-diam baru terdeteksi ~55 dtk → sekarang ~25 dtk (ping 10 dtk, stale 25 dtk, cek server tiap 10 dtk; ±360 wake-up/jam per room aktif, masih jauh di bawah kuota gratis).

## Belum selesai

1. **Belum dites di HP / beda jaringan** (TURN tidak ada di container). Pakai `?debug=1` di link room untuk lihat jalur (host/srflx/relay), `&relay=1` untuk paksa TURN.
2. **Belum deploy.** Urutan: worker dulu (`pnpm deploy:signal`), lalu web. Pastikan `NEXT_PUBLIC_SIGNAL_URL` aktif untuk Production + Preview di Vercel. Setelah worker v2 live, production web lama (protocol v1) akan menampilkan error sampai web baru ter-deploy.

## Catatan untuk Fase 3

- Foto teman sekarang = frame dari video live (resolusi preview). Fase 3: kirim foto tajam via DataChannel.
- Di slot, kiri selalu "saya". Untuk strip final, urutkan per seat (A kiri, B kanan) supaya kedua HP sama.
- `lowQuality` hanya dipasang kalau frame video teman tidak ada sama sekali.
