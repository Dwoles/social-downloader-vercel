'use strict';
/**
* Live test untuk resolver (api/_lib.js).
* Mengetes 2 kasus wajib dari King:
* 1. TikTok https://vt.tiktok.com/ZSpU5TEGg/
* -> author @jelangskuy.clip_, durasi 29 detik, varian video+audio
* 2. Teks share Douyin yang berantakan (teks Cina + kode acak)
* -> auto-extract https://v.douyin.com/UKq7Q2WfQfs/,
* judul "野火姐姐真帅", 3 varian (HD Tanpa Watermark /
* Tanpa Watermark / Audio MP3)
*
* Jalankan: node test/run-tests.cjs
* Keluar dengan kode 1 kalau ada assertion yang gagal.
*/
const { resolve} = require('../api/_lib');

let failures = 0;
function check(name, cond, extra) {
console.log((cond? ' PASS': ' FAIL') + ' ' + name + (extra? ' — ' + extra: ''));
if (!cond) failures += 1;
}

(async () => {
console.log('== Test 1: TikTok ==');
const t1 = await resolve('https://vt.tiktok.com/ZSpU5TEGg/');
console.log(JSON.stringify({ status: t1.status, platform: t1.platform, detectedUrl: t1.detectedUrl, title: t1.title, author: t1.author, durationSec: t1.durationSec, variants: t1.variants.map((v) => v.label)}, null, 2));
check('status ok', t1.status === 'ok', t1.message);
check('platform tiktok', t1.platform === 'tiktok');
check('author @jelangskuy.clip_', t1.author === '@jelangskuy.clip_', t1.author);
check('durasi 29 detik', t1.durationSec === 29, String(t1.durationSec));
check('judul mengandung "kepribadian gandanya"', (t1.title || '').includes('kepribadian gandanya'));
check('ada varian Tanpa Watermark', t1.variants.some((v) => v.label === 'Tanpa Watermark'));
check('ada varian Dengan Watermark', t1.variants.some((v) => v.label === 'Dengan Watermark'));
check('ada varian Audio / MP3', t1.variants.some((v) => v.label === 'Audio / MP3'));
check('minimal 3 varian video/audio', t1.variants.length >= 3, t1.variants.length + ' varian');
// Catatan jujur: TikWM kadang mengembalikan field hdplay (varian ke-4),
// kadang tidak. Kalau ada, varian HD ikut muncul; kalau tidak ada,
// resolver tetap mengembalikan stream play tanpa watermark.
console.log(' INFO jumlah varian TikTok di run ini: ' + t1.variants.length + ' (HD muncul hanya bila TikWM mengembalikan hdplay)');

console.log('\n== Test 2: Teks share Douyin (berantakan) ==');
const messy = '4.61 复制打开抖音，看看野火姐姐真帅 https://v.douyin.com/UKq7Q2WfQfs/ h@B.tr Hip:/ 10/13:4pm';
const t2 = await resolve(messy);
console.log(JSON.stringify({ status: t2.status, platform: t2.platform, detectedUrl: t2.detectedUrl, title: t2.title, author: t2.author, durationSec: t2.durationSec, variants: t2.variants.map((v) => v.label)}, null, 2));
check('status ok', t2.status === 'ok', t2.message);
check('platform douyin', t2.platform === 'douyin');
check('auto-extract URL', t2.detectedUrl === 'https://v.douyin.com/UKq7Q2WfQfs/', t2.detectedUrl);
check('judul "野火姐姐真帅"', t2.title === '野火姐姐真帅', t2.title);
check('ada varian HD Tanpa Watermark', t2.variants.some((v) => v.label === 'HD Tanpa Watermark'));
check('ada varian Tanpa Watermark', t2.variants.some((v) => v.label === 'Tanpa Watermark'));
check('ada varian Audio / MP3', t2.variants.some((v) => v.label === 'Audio / MP3'));
check('tepat 3 varian Douyin', t2.variants.length === 3, t2.variants.length + ' varian');

console.log('\n== Test 3: teks tanpa link (harus error jujur) ==');
const t3 = await resolve('halo ini bukan link sama sekali');
check('status error', t3.status === 'error');
check('detectedUrl null', t3.detectedUrl === null);

console.log('\n' + (failures === 0? 'SEMUA TEST LULUS': failures + ' TEST GAGAL'));
process.exit(failures === 0? 0: 1);
})().catch((e) => { console.error('Test crash:', e); process.exit(1);});
