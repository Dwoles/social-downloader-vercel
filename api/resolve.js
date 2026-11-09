'use strict';
/**
 * POST /api/resolve   body: { "url": "<link atau teks share>" }
 * GET  /api/resolve?url=<link atau teks share>
 *
 * Mengembalikan JSON:
 * { status:"ok"|"error", platform, platformLabel, detectedUrl,
 *   title, author, durationSec, thumbnailUrl,
 *   variants:[{label, kind:"video"|"audio"|"image", detail, url}], message }
 */
const { resolve } = require('./_lib');

function sendJson(res, code, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(obj);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let input = '';
  try {
    if (req.method === 'POST') {
      const body = req.body;
      if (typeof body === 'string') {
        try { input = JSON.parse(body).url || JSON.parse(body).text || ''; }
        catch { input = body; }
      } else if (body && typeof body === 'object') {
        input = body.url || body.text || '';
      }
      if (!input && req.query && req.query.url) input = req.query.url;
    } else if (req.method === 'GET') {
      input = (req.query && (req.query.url || req.query.text)) || '';
    } else {
      return sendJson(res, 405, { status: 'error', message: 'Method tidak didukung. Pakai GET atau POST.' });
    }
  } catch (e) {
    return sendJson(res, 400, { status: 'error', message: 'Body request tidak bisa dibaca.' });
  }

  if (!input || !String(input).trim()) {
    return sendJson(res, 400, {
      status: 'error', platform: 'other', platformLabel: 'Lainnya', detectedUrl: null,
      title: '', author: '', durationSec: null, thumbnailUrl: null, variants: [],
      message: 'Tempel dulu link video atau teks share dari aplikasi.',
    });
  }

  try {
    const result = await resolve(input);
    return sendJson(res, 200, result);
  } catch (e) {
    return sendJson(res, 500, {
      status: 'error', platform: 'other', platformLabel: 'Lainnya', detectedUrl: null,
      title: '', author: '', durationSec: null, thumbnailUrl: null, variants: [],
      message: 'Server gagal memproses link. Coba lagi sebentar lagi. (' + (e && e.message ? String(e.message).slice(0, 80) : 'unknown') + ')',
    });
  }
};
