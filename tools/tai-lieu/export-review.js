/*
 * Bước 1.3 — Xuất danh sách âm Hán-Việt cần soát: du-lieu/han-viet-can-soat.csv (UTF-8 có BOM, 8 cột).
 *
 *   node tools/tai-lieu/export-review.js [thư-mục-tài-liệu] [--force]
 *
 * Một chữ vào danh sách khi rơi vào ít nhất 1 trong 4 trường hợp:
 *   1. Đa âm Unihan       kVietnamese (kể cả qua chữ phồn thể) có từ 2 âm trở lên
 *   2. Đa âm HSK          chữ đọc nhiều pinyin khác nhau trong từ HSK (破音字; bỏ qua biến điệu của 一, 不)
 *   3. Thiếu trong Unihan không có kVietnamese
 *   4. Âm Unihan lệch     âm đứng đầu trong Unihan khác âm phổ thông được chọn (thường do Unihan ghi âm Nôm),
 *                         hoặc hư từ / thán từ cần ghi chú chức năng
 * Âm đề xuất: du-lieu/han-viet-claude-da-am.txt (chữ đa âm, hư từ) → nếu không có thì âm Claude ở bảng chữ.
 * Người soát sửa cột admin_final_hv rồi lưu thành du-lieu/han-viet-da-soat.csv (CSV UTF-8) → build-chars.js dùng âm này.
 */
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || 'D:/private/voc-lang-tai-lieu');
const DATA = path.join(OUT, 'du-lieu');
const file = path.join(DATA, 'han-viet-can-soat.csv');
if (fs.existsSync(file) && !args.includes('--force')) {
  console.error('Đã có', file, '— không ghi đè (có thể đang soát dở). Thêm --force nếu chắc chắn.');
  process.exit(1);
}

const rows = require(path.join(DATA, 'chu-han.json'));
const overrides = new Map();
for (const line of fs.readFileSync(path.join(DATA, 'han-viet-claude-da-am.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [c, sel, note] = line.split('|').map(s => s.trim());
  overrides.set(c, { sel, note, functionWord: /tham khảo|trợ từ|thán từ|đại từ/.test(note) && !/→/.test(note) });
}

/* ---------- Pinyin ---------- */
const TB = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v' };
const plain = s => [...s].map(c => TB[c] || c).join('');
const neutral = s => plain(s) === s;
function polyHsk(r) {
  if ('一不'.includes(r.char)) return false;                       // chỉ là biến điệu
  const ps = Object.keys(r.pinyinHsk);
  const syll = new Set(ps.map(plain).filter(p => !(r.char === '儿' && p === 'r')));
  if (syll.size >= 2) return true;
  const tones = {};
  ps.filter(p => !neutral(p)).forEach(p => { (tones[plain(p)] = tones[plain(p)] || new Set()).add(p); });
  return Object.values(tones).some(s => s.size >= 2);
}

/* ---------- So khớp âm Hán-Việt (bỏ khác biệt vị trí dấu, i/y) ---------- */
const TONES = { '\u0300': 2, '\u0301': 1, '\u0303': 3, '\u0309': 4, '\u0323': 5 };
function key(s) {
  let tone = 0;
  const base = s.toLowerCase().normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, m => { tone = TONES[m]; return ''; }).normalize('NFC');
  return base.replace(/^quy$/, 'qui').replace(/([^u])y$/, '$1i').replace(/^y$/, 'i') + tone;
}

/* ---------- Từ ví dụ: ưu tiên mỗi cách đọc một từ, cấp thấp trước ---------- */
function shortVi(v) { const s = String(v || '').split(/[;(]/)[0].trim(); return s.length > 28 ? s.slice(0, 27) + '…' : s; }
function samples(r) {
  const byWord = new Map(r.words.map(w => [w.hanzi, w]));
  const picked = [];
  const readings = Object.entries(r.pinyinHsk).sort((a, b) => b[1].length - a[1].length);
  for (const [, ws] of readings) {
    const w = ws.map(h => byWord.get(h)).filter(Boolean).sort((a, b) => (a.hanzi.length > 1 ? 0 : 1) - (b.hanzi.length > 1 ? 0 : 1) || a.level - b.level)[0];
    if (w && !picked.includes(w)) picked.push(w);
    if (picked.length >= 3) break;
  }
  for (const w of r.words.slice().sort((a, b) => (a.hanzi.length > 1 ? 0 : 1) - (b.hanzi.length > 1 ? 0 : 1) || a.level - b.level)) {
    if (picked.length >= 3) break;
    if (!picked.includes(w)) picked.push(w);
  }
  return picked.map(w => w.hanzi + ' ' + w.pinyin + ' (' + shortVi(w.vi) + ')').join('; ');
}

/* ---------- Lọc ---------- */
const G = { c1: 'Đa âm Unihan', c2: 'Đa âm HSK', c3: 'Thiếu trong Unihan', c4: 'Âm Unihan lệch / hư từ' };
const out = [], count = { c1: 0, c2: 0, c3: 0, c4: 0 }, byLevel = {};
for (const r of rows.slice().sort((a, b) => a.level - b.level || a.order - b.order)) {
  const ov = overrides.get(r.char);
  const sel = ov ? ov.sel : r.hanViet.map(s => s.toUpperCase()).join(' / ');
  const primary = sel.split('/')[0].trim();
  const f = {
    c1: r.unihanVi.length >= 2,
    c2: polyHsk(r),
    c3: !r.unihanVi.length,
    c4: (r.unihanVi.length > 0 && key(r.unihanVi[0]) !== key(primary)) || !!(ov && ov.functionWord)
  };
  if (!f.c1 && !f.c2 && !f.c3 && !f.c4) continue;
  Object.keys(f).forEach(k => { if (f[k]) count[k]++; });
  byLevel['HSK ' + r.level] = (byLevel['HSK ' + r.level] || 0) + 1;

  let note;
  if (ov) note = ov.note;
  else if (f.c3) note = 'Unihan không có âm; đề xuất theo âm phổ thông';
  else if (f.c4) note = 'Unihan ghi trước "' + r.unihanVi[0] + '" (thường là âm Nôm); chọn âm Hán-Việt phổ thông';
  else note = 'Unihan có: ' + r.unihanVi.join(', ') + '; chọn âm phổ thông';
  if (f.c2 && !ov) note += ' — CHƯA có ghi chú đa âm, cần xem';
  const reason = Object.keys(G).filter(k => f[k]).map(k => G[k]).join(' + ') + ' — ' + note;

  const pinyinAll = Object.entries(r.pinyinHsk).sort((a, b) => b[1].length - a[1].length).map(e => e[0]).join(', ');
  out.push([r.char, r.level, pinyinAll, r.unihanVi.join(', '), samples(r), sel, reason, sel]);
}

function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const head = ['char', 'hsk_level', 'pinyin_all', 'unihan_vietnamese', 'hsk_words_sample', 'ai_selected_hv', 'ai_reason', 'admin_final_hv'];
fs.writeFileSync(file, '\uFEFF' + [head].concat(out).map(r => r.map(cell).join(',')).join('\r\n') + '\r\n');

const missingNote = rows.filter(r => polyHsk(r) && !overrides.has(r.char)).map(r => r.char);
console.log('Ghi', out.length, 'dòng →', file);
console.log('Theo nhóm (một chữ có thể thuộc nhiều nhóm):', JSON.stringify(Object.fromEntries(Object.keys(G).map(k => [G[k], count[k]]))));
console.log('Theo cấp:', JSON.stringify(byLevel));
console.log('Chữ đa âm HSK chưa có ghi chú:', missingNote.join('') || 'không');
