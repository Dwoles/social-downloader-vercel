'use strict';
/**
 * GET /api/download?url=<direct-file-url>&filename=<nama-file>
 *
 * Proxy download opsional — dipakai kalau link CDN langsung kena 403 di
 * browser (misalnya video TikTok/Douyin yang butuh Referer/User-Agent).
 * Hanya mengizinkan host CDN yang dikenal, membatasi ukuran file, dan
 * meneruskan (stream) isi file tanpa menyimpannya di server.
 *
 * Batas: file > 500 MB ditolak; Vercel Hobby membatasi eksekusi 10 detik,
 * jadi proxy ini cocok untuk file kecil-menengah. Untuk file besar, pakai
 * link langsung (tombol utama) — file diunduh langsung dari CDN ke browser.
 */
const ALLOWED_HOSTS = [
  /(^|\.)tiktokcdn\.com$/,
  /(^|\.)tiktokcdn-us\.com$/,
  /(^|\.)tiktokv\.us$/,
  /(^|\.)douyinpic\.com$/,
  /(^|\.)zjcdn\.com$/,
  /(^|\.)douyinstatic\.com$/,
  /(^|\.)iesdouyin\.com$/,
  /(^|\.)snapcdn\.app$/,
  /(^|\.)tiktok\.com$/,
  /(^|\.)douyin\.com$/,
];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak didukung.' });

  const target = req.query && req.query.url;
  if (!target || typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: 'Parameter url wajib diisi (http/https).' });
  }
  let host = '';
  try { host = new URL(target).hostname.toLowerCase(); }
  catch { return res.status(400).json({ error: 'URL tidak valid.' }); }
  if (!ALLOWED_HOSTS.some((re) => re.test(host))) {
    return res.status(403).json({ error: 'Host tidak diizinkan untuk proxy: ' + host });
  }

  const filename = String((req.query && req.query.filename) || 'video.mp4')
    .replace(/[^\w.\-() ]/g, '_').slice(0, 120) || 'video.mp4';

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: host.includes('douyin') || host.includes('zjcdn') ? 'https://www.douyin.com/' : 'https://www.tiktok.com/',
        Accept: '*/*',
      },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Gagal mengambil file dari CDN (HTTP ' + upstream.status + ').' });
    }
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return res.status(413).json({ error: 'File terlalu besar (> 500 MB).' });

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (len) res.setHeader('Content-Length', String(len));
    res.status(200);

    // Stream through without buffering the whole file in memory.
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise((r) => res.once('drain', r));
      }
    } finally { reader.releaseLock(); }
    res.end();
  } catch (e) {
    if (!res.headersSent) return res.status(502).json({ error: 'Gagal mengambil file: ' + String(e && e.message ? e.message : e).slice(0, 100) });
    res.end();
  }
};
