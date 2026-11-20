/*
 * Bước 1.2 — Dựng bảng chữ Hán cho tài liệu Voc-Lang (vở luyện viết, sổ tay bộ thủ).
 *
 *   node tools/tai-lieu/build-chars.js <thư-mục-tài-liệu>
 *   (mặc định: D:/private/voc-lang-tai-lieu)
 *
 * Đầu vào (ngoài repo):
 *   _nguon/unihan/*.txt                 Unicode Unihan (kVietnamese, kTraditionalVariant, kRSUnicode)
 *   _nguon/makemeahanzi/graphics.txt    nét chữ (số nét = số nét vẽ được)
 *   _nguon/makemeahanzi/dictionary.txt  pinyin, bộ thủ, cấu tạo
 *   du-lieu/han-viet-claude.txt         âm Hán-Việt Claude điền ("字âm" hoặc "字âm1/âm2")
 *   du-lieu/han-viet-da-soat.csv        (tuỳ chọn, bước 1.4) âm đã soát — ưu tiên cao nhất
 * Đầu ra:
 *   du-lieu/chu-han.json                bảng 2.668 chữ HSK 1–6
 */
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || 'D:/private/voc-lang-tai-lieu');
const SRC = path.join(OUT, '_nguon'), DATA = path.join(OUT, 'du-lieu');
const LEVELS = ['1', '2', '3', '4', '5', '6'];
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/* ---------- Từ vựng HSK ---------- */
global.window = {};
LEVELS.forEach(l => eval(fs.readFileSync(path.join(REPO, 'js/data/hsk' + l + '.js'), 'utf8')));
const chars = new Map();
for (const l of LEVELS) {
  for (const w of window.HSK_DATA[l]) {
    for (const c of w.hanzi) {
      if (!CJK.test(c)) continue;
      if (!chars.has(c)) chars.set(c, { char: c, level: +l, order: chars.size + 1, words: [] });
      const e = chars.get(c);
      if (!e.words.some(x => x.hanzi === w.hanzi)) e.words.push({ hanzi: w.hanzi, pinyin: w.pinyin, vi: w.meaning_vi, level: +l });
    }
  }
}

/* ---------- Unihan ---------- */
function unihan(file, keys) {
  const out = {};
  for (const line of fs.readFileSync(path.join(SRC, 'unihan', file), 'utf8').split('\n')) {
    if (!line.startsWith('U+')) continue;
    const [cp, key, val] = line.split('\t');
    if (!keys.includes(key)) continue;
    (out[String.fromCodePoint(parseInt(cp.slice(2), 16))] = out[String.fromCodePoint(parseInt(cp.slice(2), 16))] || {})[key] = val.trim();
  }
  return out;
}
const R = unihan('Unihan_Readings.txt', ['kVietnamese']);
const V = unihan('Unihan_Variants.txt', ['kTraditionalVariant']);
const I = unihan('Unihan_IRGSources.txt', ['kRSUnicode']);
const cp2ch = s => String.fromCodePoint(parseInt(s.replace('U+', ''), 16));
function unihanVi(c) {
  const own = ((R[c] || {}).kVietnamese || '').split(/\s+/).filter(Boolean);
  const trads = ((V[c] || {}).kTraditionalVariant || '').split(/\s+/).filter(Boolean).map(cp2ch);
  const viaTrad = trads.flatMap(t => ((R[t] || {}).kVietnamese || '').split(/\s+/).filter(Boolean));
  return { readings: [...new Set(own.concat(viaTrad))], traditional: trads.filter(t => t !== c) };
}

/* ---------- Make Me a Hanzi ---------- */
const strokes = new Map(), dict = new Map();
for (const line of fs.readFileSync(path.join(SRC, 'makemeahanzi', 'graphics.txt'), 'utf8').split('\n')) {
  if (line) { const o = JSON.parse(line); strokes.set(o.character, o.strokes.length); }
}
for (const line of fs.readFileSync(path.join(SRC, 'makemeahanzi', 'dictionary.txt'), 'utf8').split('\n')) {
  if (line) { const o = JSON.parse(line); dict.set(o.character, o); }
}

/* ---------- Âm Hán-Việt: Claude điền + đã soát ---------- */
const claude = new Map();
for (const line of fs.readFileSync(path.join(DATA, 'han-viet-claude.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || /^L\d/.test(line)) continue;
  for (const tok of line.trim().split(/\s+/)) {
    const c = [...tok][0], rest = tok.slice(c.length);
    if (CJK.test(c) && rest) claude.set(c, rest.split('/').map(s => s.trim()).filter(Boolean));
  }
}
const reviewed = new Map();
const reviewedFile = path.join(DATA, 'han-viet-da-soat.csv');
if (fs.existsSync(reviewedFile)) {
  // cột: chu, am_chot (nhiều âm cách "/") — các cột khác bỏ qua
  const rows = parseCsv(fs.readFileSync(reviewedFile, 'utf8').replace(/^\uFEFF/, ''));
  const head = rows.shift().map(h => h.trim());
  const ci = head.indexOf('chu'), ai = head.indexOf('am_chot');
  rows.forEach(f => { if (f[ci] && f[ai]) reviewed.set(f[ci].trim(), f[ai].split('/').map(s => s.trim()).filter(Boolean)); });
}
/** CSV c\u00F3 ngo\u1EB7c k\u00E9p (Excel / Google Sheets xu\u1EA5t ra) */
function parseCsv(text) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(Boolean)) out.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some(Boolean)) out.push(row);
  return out;
}

/* So sánh âm: bỏ khác biệt vị trí dấu (hoà/hòa) và i/y cuối (kì/kỳ) */
const TONES = { '\u0300': 2, '\u0301': 1, '\u0303': 3, '\u0309': 4, '\u0323': 5 };
function key(s) {
  let tone = 0;
  const base = s.toLowerCase().normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, m => { tone = TONES[m]; return ''; }).normalize('NFC');
  return base.replace(/^quy$/, 'qui').replace(/([^u])y$/, '$1i').replace(/^y$/, 'i') + tone;
}

/* ---------- Ghép bảng ---------- */
const rows = [];
let khop = 0, lech = 0, thieuUnihan = 0, thieuClaude = 0;
for (const e of chars.values()) {
  const u = unihanVi(e.char), d = dict.get(e.char) || {};
  const mine = claude.get(e.char) || [];
  const uKeys = new Set(u.readings.map(key));
  let status;
  if (!mine.length) { status = 'thieu-claude'; thieuClaude++; }
  else if (!u.readings.length) { status = 'unihan-khong-co'; thieuUnihan++; }
  else if (mine.some(m => uKeys.has(key(m)))) { status = 'khop'; khop++; }
  else { status = 'lech'; lech++; }
  const final = reviewed.get(e.char) || mine;
  rows.push({
    char: e.char, order: e.order, level: e.level,
    hanViet: final, hanVietSource: reviewed.has(e.char) ? 'da-soat' : 'claude', hanVietCheck: status,
    unihanVi: u.readings, traditional: u.traditional,
    pinyin: d.pinyin || [], radical: d.radical || '', decomposition: d.decomposition || '',
    rsUnicode: (I[e.char] || {}).kRSUnicode || '', strokes: strokes.get(e.char) || 0,
    words: e.words
  });
}
fs.writeFileSync(path.join(DATA, 'chu-han.json'), JSON.stringify(rows, null, 1));

const byLevel = {};
rows.forEach(r => { byLevel[r.level] = (byLevel[r.level] || 0) + 1; });
console.log('Bảng chữ:', rows.length, 'chữ', JSON.stringify(byLevel));
console.log('Hán-Việt — khớp Unihan:', khop, '| lệch Unihan:', lech, '| Unihan không có:', thieuUnihan, '| Claude thiếu:', thieuClaude, '| đã soát:', reviewed.size);
console.log('Thiếu nét:', rows.filter(r => !r.strokes).map(r => r.char).join('') || 'không',
  '| thiếu pinyin:', rows.filter(r => !r.pinyin.length).map(r => r.char).join('') || 'không',
  '| thiếu bộ thủ:', rows.filter(r => !r.radical).map(r => r.char).join('') || 'không');
console.log('Ghi:', path.join(DATA, 'chu-han.json'));
