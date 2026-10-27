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

---

# Fase 3 — foto tajam, strip final, unduh & cetak (26 Okt 2026)

## Sudah jalan & teruji

- **Foto tajam via DataChannel** (`features/room/photo-channel.ts`): tiap HP mengirim foto kameranya sendiri (maks 1280 px, potongan 16 KB, ada backpressure, batas 3 MB). Saat channel terbuka kedua sisi bertukar daftar "sudah punya", jadi kiriman yang terputus oleh reconnect dikirim ulang. Channel dibuat bersama track kamera (tanpa negosiasi tambahan, tidak memicu glare).
- Slot awalnya pakai frame video teman (langsung tampil), lalu naik kelas jadi foto tajam. Kalau 15 dtk tidak datang → tetap frame video + tanda "kualitas lebih rendah". Semua tersimpan di IndexedDB.
- **Kiri = pembuat room, kanan = teman** di kedua HP (`Shot.left/right`), jadi strip identik.
- **Filter dihitung manual** (`features/frames/color-matrix.ts`, rumus spesifikasi Filter Effects), satu daftar operasi untuk pratinjau CSS dan unduhan → sama di semua browser (tanpa `ctx.filter`, aman untuk Safari < 18).
- **`renderStrip()`** (`features/frames/export-strip.ts`): geometri sama dengan `PhotoStrip`, 300 dpi, font ditunggu sebelum menggambar cap tanggal.
- **Unduh**: JPEG 92%, `snapduo-YYYY-MM-DD.jpg`; di HP pakai lembar share (Simpan ke Foto). **Cetak**: hanya strip, ukuran fisik frame (CSS di `globals.css`). Tombol menunggu foto tajam teman.
- Tombol "Bagikan link" menampilkan catatan "menyusul" (Fase 4).

**Tes**: unit web 94/94 (+ filter, photo channel, posisi kiri/kanan), E2E 15/15 (foto tajam 2/2 di kedua sisi, unduhan 1200×1800 untuk Duo, cetak 4×6 in). Dibandingkan visual: pratinjau vs unduhan identik (Strip malam + Hitam putih).

## Catatan

- Pemotongan foto ke slot pakai tengah (sama dengan pratinjau), bukan fokus 0,42.
- Belum dites di iPhone: lembar share "Simpan ke Foto" dan cetak dari Safari. Tolong cek saat tes HP.

---

# Fase 4 — link berbagi 24 jam (27 Okt 2026)

## Keputusan

- **Penyimpanan di Durable Object, bukan R2**: tanpa kartu/setup bucket, dan alarm DO menghapus **tepat** 24 jam (lifecycle R2 per hari bisa molor sampai ±48 jam).
- DO `ShareObject` (satu per link) selalu memegang aturan 24 jam. Byte file ada di balik `BlobStore` (`apps/signal/src/share.ts`); kalau nanti ada video, tinggal tambah `R2BlobStore` — alarm DO tetap yang menghapus, lifecycle R2 hanya cadangan.
- File disimpan per potongan 1 MB (batas DO 2 MB per nilai tidak terasa). Batas unggah 5 MB, maks 5 link per orang per room.
- Unggah wajib dari orang yang punya kursi di room (token kursi dicek oleh RoomObject). File harus JPEG.
- Pratinjau link di WhatsApp dkk. **tidak** menampilkan foto (gambar pratinjau disimpan server mereka melewati 24 jam).

## Sudah jalan & teruji

- Worker: `POST /shares`, `GET /shares/:id`, `GET /shares/:id/image` (publik, CORS `*`, `noindex`), `DELETE /shares/:id` (token hapus). Lewat 24 jam → 410 lalu dihapus walau alarm telat.
- Web: tombol "Bagikan link" mengunggah salinanmu (dengan filtermu), panel link dengan salin ke clipboard, hitung mundur asli, "Hapus sekarang". Link diingat di perangkat (localStorage) sampai kedaluwarsa.
- Halaman `/p/[id]`: strip asli, sisa waktu, Unduh, "Bikin punyamu"; kedaluwarsa/dihapus → layar "sudah dihapus"; gagal muat → coba lagi.
- Tes: worker 22/22 (7 baru: tolak tanpa kursi/situs lain/bukan JPEG/>5 MB, batas 5 link, file 2,5 MB utuh lewat 3 potongan, hapus pakai token, kedaluwarsa + alarm). Protocol 26/26, web 94/94. E2E **17/17** (bagikan → orang lain buka & unduh 1200×1800 → hapus → "sudah dihapus"). Halaman `/p` dicek di HP terang/gelap: aksesibilitas bersih.

## Deploy

Worker punya Durable Object baru (migration `v2`, binding `SHARE`) — tidak perlu setup apa pun di dashboard; deploy biasa dari `main` sudah membuatnya. Deploy worker dulu (atau bersamaan); web lama tetap jalan dengan worker baru.

## Juga diperbaiki

- Tombol "Buat room" terkunci ("Membuat room…") dan dialog "Gabung room" masih terbuka setelah keluar dari booth (state halaman disimpan Next.js).

---

# Fase 5 (A–C) — hardening (27 Okt 2026)

## A. Batas laju & biaya
- Batas per menit per IP (binding Rate Limiting Cloudflare, perkiraan per lokasi): buat room 10, unggah share 5, TURN 20, koneksi socket 30, baca share 120. Lewat → 429 + `Retry-After`, web menampilkan "Terlalu banyak percobaan".
- Kuota harian tepat per IP (`QuotaObject`, DO per IP per hari, menghapus diri): buat room 60, unggah share 30.
- **TURN hanya untuk yang punya kursi** (token kursi). Web mengambil kredensial setelah masuk room; diperbarui setelah 90 menit saat reconnect.
- Socket yang mengirim > 200 pesan / > 40 intent per 10 detik diputus.
- Tes worker 27/27 (5 baru: batas room per menit, kuota harian, TURN wajib kursi, banjir pesan diputus, trafik normal aman).

## B. Browser bawaan aplikasi
- Instagram/Facebook/LINE/TikTok/Snapchat/X/LinkedIn/WeChat/Threads, atau browser tanpa kamera/WebRTC/https → layar "Buka di browser biasa dulu": langkah iPhone/Android, Salin link, tombol "Buka di Chrome" (Android), "Coba tetap lanjut".
- Dites dengan user agent asli (unit) dan tampilan iPhone-Instagram / Android-Facebook (aksesibilitas bersih).

## C. CI
- `.github/workflows/ci.yml`: install, typecheck, lint, semua tes (151), build web di setiap PR dan push ke `main`.

## Bug yang ketemu & diperbaiki
- Di HP lambat, slot sesaat menampilkan setengah abu-abu: foto tajam teman tiba sebelum foto sendiri selesai di-encode. Sekarang foto teman ditahan sampai foto sendiri siap. E2E 17/17 tiga kali berturut-turut.

---

# Fase 5 (D–F) — laporan error, 404/error, header keamanan (27 Okt 2026)

## D. Laporan error dari browser
- Error yang tidak tertangkap, promise yang gagal, dan error render (error boundary) dikirim ke `POST /errors` di worker → **Workers Logs** (`event: "client_error"`). Hanya build production; maks 10 per halaman, pesan sama sekali saja; noise (ekstensi browser, "Script error.", ResizeObserver) diabaikan.
- Tanpa data pribadi: tanpa IP, tanpa query/hash; **ID room & link disamarkan** (`/r/:room`, `/p/:share`, UUID → `:uuid`) di browser dan lagi di worker. Batas 8 KB, 20/menit per IP, hanya dari situs sendiri.
- Melihatnya: Cloudflare → Workers → snapduo-signal → Observability/Logs, cari `client_error`.

## E. Halaman 404 & error
- 404 dua bahasa bergaya Snapduo untuk semua URL tak dikenal (route penampung `[lang]/[...rest]`), status 404, judul "404 · Snapduo", `noindex`.
- Error saat render → layar "Ada yang tidak beres" + Coba lagi (dan dilaporkan). `global-error.tsx` sebagai cadangan terakhir.
- Diperbaiki sekalian: tema gelap tidak terbaca di halaman 404 (Next membangun ulang `<head>` di browser, script tema tidak jalan) → `ThemeSync` menerapkannya.

## F. Header keamanan (semua halaman)
- **CSP** (production): script/style hanya dari situs sendiri (+ inline), gambar dari situs/`blob:`/`data:`/worker, koneksi hanya ke worker (HTTP + WebSocket), tidak bisa di-iframe, `object-src 'none'`. `'unsafe-inline'` dipertahankan karena nonce akan memaksa semua halaman dirender per request.
- `Permissions-Policy` (kamera & mikrofon hanya untuk situs ini), `Referrer-Policy: strict-origin-when-cross-origin` (situs lain tidak melihat path room), `nosniff`, `X-Frame-Options: DENY`, HSTS.

## Tes
- Protocol 29/29, web 102/102, worker 29/29.
- E2E **18/18**, termasuk **0 pelanggaran CSP** di semua tab (kamera, video, foto tajam, unduh, cetak, link berbagi, halaman orang asing).
- 404 id/en/bahasa tak dikenal: status 404, aksesibilitas bersih, tema benar. Error sungguhan di halaman room sampai ke log worker dengan ID tersamarkan.

## Berikutnya
- Audit keamanan (skill `security-audit`): saran profil `quick`, cakupan `apps/signal` + `packages/protocol`, budget ±12 agent.
