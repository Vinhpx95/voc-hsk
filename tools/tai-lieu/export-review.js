/*
 * Bước 1.3 — Xuất danh sách âm Hán-Việt cần soát (CSV UTF-8 có BOM, mở bằng Excel / Google Sheets).
 *
 *   node tools/tai-lieu/export-review.js [thư-mục-tài-liệu] [--force]
 *
 * Đọc du-lieu/chu-han.json (bước 1.2), ghi du-lieu/han-viet-can-soat.csv gồm:
 *   - chữ Unihan không có âm, chữ lệch Unihan (thường do Unihan ghi âm Nôm), chữ có nhiều âm Hán-Việt.
 * Cột "am_chot" điền sẵn âm Claude chọn — người soát sửa thẳng vào cột này (nhiều âm: "lạc/nhạc", âm thường dùng trước).
 * Soát xong lưu thành du-lieu/han-viet-da-soat.csv (CSV UTF-8) → build-chars.js tự ưu tiên âm đã soát.
 * Không ghi đè file đã có (tránh mất phần đã soát), trừ khi thêm --force.
 */
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || 'D:/private/voc-lang-tai-lieu');
const file = path.join(OUT, 'du-lieu', 'han-viet-can-soat.csv');
if (fs.existsSync(file) && !args.includes('--force')) {
  console.error('Đã có', file, '— không ghi đè. Thêm --force nếu chắc chắn.');
  process.exit(1);
}

const rows = require(path.join(OUT, 'du-lieu', 'chu-han.json'));
const REASON = { 'unihan-khong-co': 'Unihan không có', lech: 'Lệch Unihan (thường do Unihan ghi âm Nôm)' };
const pick = rows.filter(r => REASON[r.hanVietCheck] || r.hanViet.length > 1)
  .sort((a, b) => a.level - b.level || a.order - b.order);

function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const head = ['stt', 'cap_hsk', 'chu', 'phon_the', 'pinyin', 'am_chot', 'am_unihan', 'ly_do', 'tu_vi_du', 'ghi_chu'];
const lines = [head.join(',')].concat(pick.map((r, i) => [
  i + 1,
  'HSK ' + r.level,
  r.char,
  r.traditional.join(' '),
  r.pinyin.join(', '),
  r.hanViet.join('/'),
  r.unihanVi.join(', '),
  REASON[r.hanVietCheck] || 'Nhiều âm — kiểm tra thứ tự',
  r.words.slice(0, 2).map(w => w.hanzi + ' ' + w.pinyin + ' (' + w.vi + ')').join('; '),
  ''
].map(cell).join(',')));
fs.writeFileSync(file, '\uFEFF' + lines.join('\r\n') + '\r\n');

const count = {};
pick.forEach(r => { const k = REASON[r.hanVietCheck] || 'Nhiều âm'; count[k] = (count[k] || 0) + 1; });
const byLevel = {};
pick.forEach(r => { byLevel['HSK ' + r.level] = (byLevel['HSK ' + r.level] || 0) + 1; });
console.log('Ghi', pick.length, 'dòng →', file);
console.log(JSON.stringify(count));
console.log(JSON.stringify(byLevel));
