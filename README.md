# Social Media Video Downloader — Paket Vercel

Kloningan web downloader ala TTGet (ttget.com): tempel link video TikTok /
Douyin, unduh tanpa watermark. Gratis, tanpa login, tanpa aplikasi.

**Yang sudah bisa di-resolve penuh: TikTok dan Douyin.**
Platform lain (Instagram, YouTube, X, Facebook, Threads, Pinterest,
Snapchat, Reddit, CapCut, Bilibili) tampil di UI sebagai chip, tapi kalau
ditempel akan dijawab dengan error jujur "belum didukung" — tidak ada hasil
palsu.

## Isi paket

```
social-downloader-vercel/
├── public/index.html # UI Bahasa Indonesia (tempel link, auto-detect,
│ # pratinjau "Link terdeteksi", kartu hasil,
│ # tombol varian, riwayat localStorage, cara pakai, FAQ)
├── api/_lib.js # Logika resolver (dipakai api/*.js + test)
├── api/resolve.js # POST/GET /api/resolve -> JSON hasil resolve
├── api/download.js # GET /api/download?url=... -> proxy download (opsional)
├── package.json # Tanpa dependensi, Node >= 18
├── vercel.json # maxDuration 10 detik untuk kedua function
├──.gitignore
└── test/run-tests.cjs # Test live kedua link wajib (lihat bawah)
```

## Cara kerja resolver

1. **Auto-detect link** — `extractUrl()` mengambil URL pertama dari teks
apa pun yang ditempel (termasuk teks share Douyin yang penuh huruf Cina
dan kode acak). Link tanpa skema (`v.douyin.com/...`) otomatis diberi
`https://`.
2. **TikTok** — TikWM: `GET https://www.tikwm.com/api/?url=<encoded>`
(field: `data.play`, `data.wmplay`, `data.music`, `data.cover`,
`data.title`, `data.author.nickname` / `unique_id`, `data.duration`).
Varian: Tanpa Watermark, Dengan Watermark, Audio/MP3, plus **HD Tanpa
Watermark hanya bila TikWM mengembalikan field `hdplay`** (tidak selalu
ada — lihat catatan test di bawah).
3. **Douyin** — TikWM dulu (biasanya menolak Douyin: `code -1, "Url
parsing is failed!"`), lalu fallback **Siputzx**:
`GET https://api.siputzx.my.id/api/d/douyin?url=<encoded>`
Mengembalikan `{ status:true, data:{ title, thumbnail, downloads:[
{quality:"Server 1"|"Server 2"|"Server 3", url:"https://dl.snapcdn.app/get?token=<JWT>"}]}}`.
Token JWT di-decode (payload `{url, filename}`) untuk mengklasifikasi:
`..._hd.mp4` → HD Tanpa Watermark, `....mp4` → Tanpa Watermark,
`....mp3` → Audio/MP3. Link token snapcdn-lah yang dipakai sebagai
tombol download (link stabil & bertanda tangan).
4. **Platform lain** — error jujur, bukan hasil palsu.

> Catatan: semua resolver di atas adalah API publik pihak ketiga tanpa
> kunci. Mereka bisa berubah / mati sewaktu-waktu — kalau suatu hari
> Douyin gagal lagi, ganti URL fallback di `api/_lib.js`
> (`resolveDouyinViaSiputzx`) dengan resolver publik lain yang masih hidup.

## Deploy ke Vercel (via GitHub, 5 langkah)

1. **Buat repo GitHub baru** (misalnya `social-downloader`), lalu upload
seluruh isi folder ini ke repo tersebut:
```bash
git init
git add.
git commit -m "Social downloader v1"
git branch -M main
git remote add origin https://github.com/<username-kamu>/social-downloader.git
git push -u origin main
```
2. **Buka [vercel.com](https://vercel.com)** → daftar / login dengan GitHub.
3. Klik **Add New → Project → Import** → pilih repo `social-downloader`.
4. Biarkan semua setting default (framework: Other, root directory: `.`)
→ klik **Deploy**.
5. Selesai — situs live di `https://social-downloader.vercel.app`
(nama bisa diganti di Settings → Domains). Setiap `git push` ke `main`
akan deploy ulang otomatis.

### Domain sendiri (opsional)

Vercel → Project → **Settings → Domains** → tambahkan domainmu
(misalnya `downloadku.com`), lalu atur DNS di tempat kamu beli domain
sesuai instruksi Vercel (biasanya record `A` / `CNAME`). SSL gratis
otomatis dari Vercel.

### Test lokal sebelum deploy

```bash
# 1) Test resolver (wajib — mengetes 2 link di bawah secara live)
node test/run-tests.cjs

# 2) Jalankan situsnya seperti di Vercel (butuh Vercel CLI)
npx vercel dev
# lalu buka http://localhost:3000
```

## Test yang sudah dijalankan (live, 10 Nov 2026)

Perintah: `node test/run-tests.cjs` — **SEMUA TEST LULUS**.

**Test 1 — TikTok** `https://vt.tiktok.com/ZSpU5TEGg/`
- status `ok`, platform `tiktok`, author `@jelangskuy.clip_`, durasi **29 detik**
- judul: "amat dengan kepribadian gandanya😭🤣🤣 @JELANGSKUY @TOTAL JELANGSKUY! …"
- varian (3 di run ini): Tanpa Watermark, Dengan Watermark, Audio / MP3
- ⚠️ **Catatan jujur:** di run sebelumnya (versi Muse artifact) TikWM
mengembalikan field `hdplay` sehingga ada varian ke-4 "HD Tanpa
Watermark". Di run test paket ini (GET maupun POST ke TikWM) field
`hdplay` **tidak ada**, jadi variannya 3. Kode sudah menangani
keduanya: kalau `hdplay` ada, varian HD otomatis muncul. Stream
`play` TikWM sendiri adalah stream bersih kualitas tertinggi yang
tersedia.

**Test 2 — Teks share Douyin (berantakan)**
`4.61 复制打开抖音，看看野火姐姐真帅 https://v.douyin.com/UKq7Q2WfQfs/ h@B.tr Hip:/ 10/13:4pm`
- auto-extract → `https://v.douyin.com/UKq7Q2WfQfs/` ✅
- status `ok`, platform `douyin`, judul **"野火姐姐真帅"**
- varian (3): HD Tanpa Watermark, Tanpa Watermark, Audio / MP3
(via Siputzx `/api/d/douyin` — TikWM menolak video ini)
- File videonya juga diverifikasi langsung: MP4 valid
(`ftyp isom`), **2.425.758 byte**, 576×1024, 11 detik, tanpa watermark.

**Test 3 — Teks tanpa link** → error jujur "Tidak ditemukan link",
`detectedUrl: null`. ✅

Handler Vercel-nya sendiri (`api/resolve.js`) juga sudah dites lokal
dengan mock request untuk kedua link di atas — keduanya `HTTP 200,
status ok` dengan varian yang sama.

## Batas Vercel Hobby (gratis)

- **Gratis, tapi hanya proyek personal / non-komersial.** Kalau situs
dipasangi iklan atau menghasilkan uang, wajib upgrade ke Pro
($20/bulan/pengguna).
- **Serverless function maksimal 10 detik** per request
(sudah diatur di `vercel.json`: `maxDuration: 10`). Resolver TikTok/
Douyin biasanya selesai dalam 1–4 detik. Kalau API pihak ketiga
lambat, request bisa kena timeout — pengguna akan mendapat pesan
error dan bisa coba lagi.
- **100.000 pemanggilan function/bulan**, bandwidth 100 GB/bulan.
- File video **tidak** lewat server Vercel (tombol utama langsung ke
CDN platform). Proxy `/api/download` hanya fallback kalau link
langsung kena 403, dan dibatasi: host CDN yang diizinkan saja,
maksimal 500 MB.

## Legal / disclaimer

Untuk penggunaan pribadi saja. Unduh hanya konten publik atau konten
milikmu sendiri, patuhi hukum hak cipta dan ketentuan layanan tiap
platform (TikTok, Douyin, dll.). Situs ini tidak menyimpan video di
server — file diunduh langsung dari server platform aslinya. Resolver
pihak ketiga (TikWM, Siputzx) bukan milik/afiliasi proyek ini.
