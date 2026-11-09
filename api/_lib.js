'use strict';
/**
 * Shared resolver logic for the Social Media Video Downloader.
 * Used by api/resolve.js (Vercel serverless) and test/run-tests.cjs.
 * Zero dependencies — only the global fetch (Node 18+).
 *
 * Resolvers (all public, no API key):
 *  - TikTok + Douyin (primary): TikWM  https://www.tikwm.com/api/?url=<encoded>
 *  - Douyin (fallback, REQUIRED — TikWM rejects Douyin links):
 *      Siputzx  https://api.siputzx.my.id/api/d/douyin?url=<encoded>
 *      Returns { status:true, data:{ title, thumbnail, downloads:[
 *        {quality:"Server 1", url:"https://dl.snapcdn.app/get?token=<JWT>"},
 *        {quality:"Server 2", ..._hd.mp4}, {quality:"Server 3", ...mp3} ] } }
 *      The JWT token payload contains { url, filename } — we decode it to
 *      classify HD / normal / audio instead of trusting the "Server N" label.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const KNOWN_HOSTS = [
  'tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com',
  'douyin.com', 'v.douyin.com', 'iesdouyin.com',
  'instagram.com', 'youtube.com', 'youtu.be',
  'x.com', 'twitter.com', 'facebook.com', 'fb.watch',
  'threads.net', 'pinterest.com', 'pin.it',
  'snapchat.com', 'reddit.com', 'capcut.com',
  'bilibili.com', 'b23.tv', 'xiaohongshu.com', 'kuaishou.com',
];

// Characters that commonly trail a pasted URL (closing brackets, punctuation,
// Chinese full-width punctuation from Douyin share text, etc.)
const TRAILING_JUNK = /[)\]}>\"'’”.,;:!?\u3002\uff0c\u3001\u300b\u3009\u3011\u3015\u3017\u3019]+$/;

function cleanUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim().replace(TRAILING_JUNK, '').trim();
  return u || null;
}

/**
 * Extract the first URL from arbitrary pasted text (e.g. a Douyin share
 * caption full of Chinese text and codes). Handles:
 *  - full https://... links
 *  - scheme-less links such as v.douyin.com/xxxx or vt.tiktok.com/xxxx
 * Returns null when no link is found.
 */
function extractUrl(input) {
  if (!input) return null;
  const text = String(input);

  // 1) Full http(s) URL
  const full = text.match(/https?:\/\/[^\s"'<>\[\]{}|\\^`]+/i);
  if (full) return cleanUrl(full[0]);

  // 2) Scheme-less known-domain link
  const hostPart = KNOWN_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|');
  const bare = text.match(new RegExp(`(?:^|[\\s"'\\(\\[\\{\\u300a\\u3010])((?:${hostPart})\\/[^\\s"'<>\\[\\]{}|\\\\^\\\`]+)`, 'i'));
  if (bare) {
    const u = cleanUrl(bare[1]);
    return u ? 'https://' + u : null;
  }
  return null;
}

function detectPlatform(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'other'; }
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('douyin.com') || host.includes('iesdouyin.com')) return 'douyin';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook';
  if (host.includes('threads.net')) return 'threads';
  if (host.includes('pinterest.') || host.includes('pin.it')) return 'pinterest';
  if (host.includes('snapchat.com')) return 'snapchat';
  if (host.includes('reddit.com')) return 'reddit';
  if (host.includes('capcut.com')) return 'capcut';
  if (host.includes('bilibili.com') || host.includes('b23.tv')) return 'bilibili';
  if (host.includes('xiaohongshu.com')) return 'xiaohongshu';
  if (host.includes('kuaishou.com')) return 'kuaishou';
  return 'other';
}

const PLATFORM_LABELS = {
  tiktok: 'TikTok', douyin: 'Douyin', instagram: 'Instagram', youtube: 'YouTube',
  x: 'X (Twitter)', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest',
  snapchat: 'Snapchat', reddit: 'Reddit', capcut: 'CapCut', bilibili: 'Bilibili',
  xiaohongshu: 'Xiaohongshu', kuaishou: 'Kuaishou', other: 'Lainnya',
};

async function fetchJson(url, timeoutMs = 8000, extraHeaders = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...extraHeaders },
    });
    const text = await res.text();
    try { return { http: res.status, json: JSON.parse(text) }; }
    catch { return { http: res.status, json: null, raw: text }; }
  } finally { clearTimeout(timer); }
}

function err(platform, detectedUrl, message) {
  return { status: 'error', platform, platformLabel: PLATFORM_LABELS[platform] || platform, detectedUrl, title: '', author: '', durationSec: null, thumbnailUrl: null, variants: [], message };
}

function ok(platform, detectedUrl, fields) {
  return {
    status: 'ok', platform, platformLabel: PLATFORM_LABELS[platform] || platform,
    detectedUrl, title: fields.title || '', author: fields.author || '',
    durationSec: fields.durationSec ?? null, thumbnailUrl: fields.thumbnailUrl || null,
    variants: fields.variants || [], message: '',
  };
}

/* ---------------- TikWM (TikTok primary, Douyin attempt) ---------------- */

function mapTikwm(data) {
  const variants = [];
  // TikWM's `play` is the clean (no-watermark) stream. `hdplay` only exists
  // on some responses — when present and different, it is the HD variant.
  if (data.hdplay && data.hdplay !== data.play) {
    variants.push({ label: 'HD Tanpa Watermark', kind: 'video', detail: 'MP4 · kualitas tertinggi', url: data.hdplay });
  }
  if (data.play) {
    variants.push({ label: 'Tanpa Watermark', kind: 'video', detail: 'MP4 · tanpa watermark', url: data.play });
  }
  if (data.wmplay) {
    variants.push({ label: 'Dengan Watermark', kind: 'video', detail: 'MP4 · versi asli', url: data.wmplay });
  }
  if (data.music) {
    const musicTitle = (data.music_info && data.music_info.title) || '';
    variants.push({ label: 'Audio / MP3', kind: 'audio', detail: musicTitle ? `MP3 · ${musicTitle}` : 'MP3 · musik asli', url: data.music });
  }
  if (Array.isArray(data.images) && data.images.length) {
    data.images.forEach((img, i) => {
      if (img) variants.push({ label: `Foto ${i + 1}`, kind: 'image', detail: 'JPG · slideshow', url: img });
    });
  }
  return variants;
}

async function resolveViaTikwm(url) {
  const api = 'https://www.tikwm.com/api/?url=' + encodeURIComponent(url);
  const { json } = await fetchJson(api, 8000);
  if (json && json.code === 0 && json.data && (json.data.play || json.data.wmplay || (Array.isArray(json.data.images) && json.data.images.length))) {
    const d = json.data;
    const author = d.author
      ? (d.author.unique_id ? '@' + d.author.unique_id : d.author.nickname || '')
      : '';
    return ok(detectPlatform(url), url, {
      title: d.title || '',
      author,
      durationSec: typeof d.duration === 'number' ? d.duration : null,
      thumbnailUrl: d.cover || d.origin_cover || null,
      variants: mapTikwm(d),
    });
  }
  return null; // caller decides the fallback / error message
}

/* ---------------- Siputzx Douyin fallback ---------------- */

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return null; }
}

function mapSiputzxDouyin(data) {
  const downloads = Array.isArray(data.downloads) ? data.downloads : [];
  const mapped = downloads.map((d, i) => {
    let url = d.url || '';
    let kind = 'video';
    let label = 'Tanpa Watermark';
    let detail = 'MP4 · tanpa watermark';
    // The snapcdn token is a JWT whose payload carries {url, filename}.
    // filename examples: LoveTik.App_<id>.mp4 | ..._hd.mp4 | ....mp3
    try {
      const token = new URL(url).searchParams.get('token');
      const payload = token ? decodeJwtPayload(token) : null;
      if (payload && payload.filename) {
        const fn = String(payload.filename).toLowerCase();
        if (fn.endsWith('.mp3')) { kind = 'audio'; label = 'Audio / MP3'; detail = 'MP3 · musik asli'; }
        else if (fn.includes('_hd.mp4')) { label = 'HD Tanpa Watermark'; detail = 'MP4 · HD · tanpa watermark'; }
        if (payload.url) url = payload.url; // direct CDN URL also works; keep token URL instead (see below)
      }
    } catch { /* keep defaults */ }
    // Keep the snapcdn token URL (not the decoded inner URL): the token URL
    // is the stable, signed download link; the inner URL may 403 without it.
    return { label, kind, detail, url: d.url, _order: i };
  });
  // Order: HD first, then normal video, then audio — regardless of server order.
  const rank = { 'HD Tanpa Watermark': 0, 'Tanpa Watermark': 1, 'Audio / MP3': 2 };
  mapped.sort((a, b) => (rank[a.label] ?? 9) - (rank[b.label] ?? 9) || a._order - b._order);
  return mapped.map(({ label, kind, detail, url }) => ({ label, kind, detail, url }));
}

async function resolveDouyinViaSiputzx(url) {
  const api = 'https://api.siputzx.my.id/api/d/douyin?url=' + encodeURIComponent(url);
  const { json } = await fetchJson(api, 8000);
  if (json && json.status === true && json.data && Array.isArray(json.data.downloads) && json.data.downloads.length) {
    const variants = mapSiputzxDouyin(json.data);
    if (variants.length) {
      return ok('douyin', url, {
        title: json.data.title || '',
        author: json.data.author || '',
        durationSec: null, // Siputzx does not return duration
        thumbnailUrl: (json.data.thumbnail || '').replace(/&amp;/g, '&') || null,
        variants,
      });
    }
  }
  return null;
}

/* ---------------- Main entry ---------------- */

async function resolve(input) {
  const detectedUrl = extractUrl(input);
  if (!detectedUrl) {
    return { status: 'error', platform: 'other', platformLabel: 'Lainnya', detectedUrl: null, title: '', author: '', durationSec: null, thumbnailUrl: null, variants: [], message: 'Tidak ditemukan link di teks yang ditempel. Tempel link video atau teks share dari aplikasi (misalnya teks share Douyin/TikTok).' };
  }
  const platform = detectPlatform(detectedUrl);

  if (platform === 'tiktok') {
    const viaTikwm = await resolveViaTikwm(detectedUrl).catch(() => null);
    if (viaTikwm) return viaTikwm;
    return err(platform, detectedUrl, 'Link TikTok tidak bisa dibaca. Pastikan link videonya valid dan videonya publik, lalu coba lagi.');
  }

  if (platform === 'douyin') {
    // TikWM rejects Douyin links (code -1 "Url parsing is failed!") — try it
    // anyway for videos it does accept, then fall back to Siputzx.
    const viaTikwm = await resolveViaTikwm(detectedUrl).catch(() => null);
    if (viaTikwm) return viaTikwm;
    const viaSiputzx = await resolveDouyinViaSiputzx(detectedUrl).catch(() => null);
    if (viaSiputzx) return viaSiputzx;
    return err(platform, detectedUrl, 'Link Douyin-nya terdeteksi dan valid, tapi server pemroses Douyin sedang menolak video ini. Coba lagi beberapa saat lagi, atau salin ulang link share yang segar dari aplikasi Douyin.');
  }

  // Other platforms: honest unsupported error (no fake results).
  return err(platform, detectedUrl, `Platform ${PLATFORM_LABELS[platform] || platform} belum didukung di versi ini. Yang sudah bisa di-resolve: TikTok dan Douyin.`);
}

module.exports = {
  extractUrl, detectPlatform, PLATFORM_LABELS,
  resolve, resolveViaTikwm, resolveDouyinViaSiputzx, mapTikwm, mapSiputzxDouyin,
};
