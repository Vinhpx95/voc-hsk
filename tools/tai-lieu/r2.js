/*
 * Kho tài liệu trên Cloudflare R2 (bucket riêng tư) — tải file lên và tạo link tải có hạn để dán vào mail gửi người mua.
 *
 *   node tools/tai-lieu/r2.js link <tên-file-trên-R2> [--hours 12]   in link tải hết hạn sau N giờ (mặc định 12, tối đa 168)
 *   node tools/tai-lieu/r2.js upload <file-trên-máy> [tên-trên-R2]    tải lên (mặc định giữ tên file)
 *   node tools/tai-lieu/r2.js list                                     liệt kê file trong bucket
 *   node tools/tai-lieu/r2.js delete <tên-file-trên-R2>
 *
 * Khóa: D:/private/voc-lang-tai-lieu/.r2.env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) — không bao giờ in ra.
 * Ký yêu cầu theo AWS Signature V4 (R2 tương thích S3), không cần cài thêm gói nào.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENV_FILE = process.env.R2_ENV || 'D:/private/voc-lang-tai-lieu/.r2.env';
const env = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const { R2_ACCOUNT_ID: ACCOUNT, R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_BUCKET: BUCKET } = env;
if (!ACCOUNT || !AK || !SK || !BUCKET) { console.error('Thiếu giá trị trong', ENV_FILE); process.exit(1); }
const HOST = ACCOUNT + '.r2.cloudflarestorage.com', REGION = 'auto', SERVICE = 's3';

const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = k => '/' + enc(BUCKET) + '/' + k.split('/').map(enc).join('/');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function stamp(d = new Date()) { const t = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); return { amz: t, day: t.slice(0, 8) }; }
function signature(day, toSign) {
  const k = hmac(hmac(hmac(hmac('AWS4' + SK, day), REGION), SERVICE), 'aws4_request');
  return crypto.createHmac('sha256', k).update(toSign).digest('hex');
}
const canonQuery = q => Object.keys(q).sort().map(k => enc(k) + '=' + enc(q[k])).join('&');

/* Link ký sẵn (query string), không cần header → dán thẳng vào mail */
function presign(key, hours, filename) {
  const { amz, day } = stamp(), scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${AK}/${scope}`, 'X-Amz-Date': amz,
    'X-Amz-Expires': String(Math.round(hours * 3600)), 'X-Amz-SignedHeaders': 'host',
    'response-content-disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"`
  };
  const canon = ['GET', encPath(key), canonQuery(q), `host:${HOST}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sig = signature(day, ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n'));
  return `https://${HOST}${encPath(key)}?${canonQuery(q)}&X-Amz-Signature=${sig}`;
}

/* Gọi API có ký ở header */
async function call(method, key, query = {}, body, extra = {}) {
  const { amz, day } = stamp(), scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const p = key == null ? '/' + enc(BUCKET) : encPath(key);
  const h = { host: HOST, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amz, ...extra };
  const names = Object.keys(h).map(s => s.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canon = [method, p, canonQuery(query), names.map(n => n + ':' + lower[n] + '\n').join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const sig = signature(day, ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n'));
  const headers = { ...h, Authorization: `AWS4-HMAC-SHA256 Credential=${AK}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}` };
  delete headers.host;
  const qs = Object.keys(query).length ? '?' + canonQuery(query) : '';
  const res = await fetch(`https://${HOST}${p}${qs}`, { method, headers, body, duplex: body ? 'half' : undefined });
  if (!res.ok) throw new Error(method + ' ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res;
}

const MIME = { '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const [cmd, a, b] = process.argv.slice(2).filter(x => !x.startsWith('--'));
const hoursArg = (() => { const i = process.argv.indexOf('--hours'); return i > 0 ? +process.argv[i + 1] : 12; })();

(async () => {
  if (cmd === 'upload') {
    if (!a || !fs.existsSync(a)) throw new Error('Không thấy file: ' + a);
    const key = b || path.basename(a), size = fs.statSync(a).size;
    if (size > 5 * 1024 ** 3) throw new Error('File lớn hơn 5 GB, cần tải lên nhiều phần');
    const t0 = Date.now();
    const { Readable } = require('stream');
    await call('PUT', key, {}, Readable.toWeb(fs.createReadStream(a)), { 'content-length': size, 'content-type': MIME[path.extname(a).toLowerCase()] || 'application/octet-stream' });
    console.log('✓ Đã tải lên', key, '(' + mb(size) + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)');
  } else if (cmd === 'link') {
    if (!a) throw new Error('Thiếu tên file trên R2');
    if (!(hoursArg > 0 && hoursArg <= 168)) throw new Error('--hours phải từ 0 đến 168 (7 ngày)');
    await call('HEAD', a).catch(() => { throw new Error('Không có file "' + a + '" trên R2 (xem: node tools/tai-lieu/r2.js list)'); });
    const until = new Date(Date.now() + hoursArg * 3600e3);
    console.log(presign(a, hoursArg, path.basename(a)));
    console.log('→ Hết hạn lúc', until.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), '(giờ Việt Nam)');
  } else if (cmd === 'list') {
    const xml = await (await call('GET', null, { 'list-type': '2' })).text();
    const items = [...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)];
    if (!items.length) console.log('(bucket trống)');
    items.forEach(m => console.log(m[1].padEnd(50), mb(+m[2])));
  } else if (cmd === 'delete') {
    if (!a) throw new Error('Thiếu tên file trên R2');
    await call('DELETE', a);
    console.log('✓ Đã xóa', a);
  } else {
    console.log('Dùng: link <tên> [--hours 12] | upload <file> [tên] | list | delete <tên>');
  }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
