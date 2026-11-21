/*
 * Bước 4.1 — bảng 214 bộ thủ cho sổ tay (gói 3).
 *
 *   node tools/tai-lieu/build-radicals.js [--root D:/private/voc-lang-tai-lieu]
 *
 * Đọc:  _nguon/unihan/CJKRadicals.txt   chữ bộ Khang Hy và dạng giản thể (số có dấu ')
 *       _nguon/unihan/Unihan_IRGSources.txt   số nét (kTotalStrokes)
 *       du-lieu/bo-thu-ten.txt             tên Hán-Việt, nghĩa, biến thể khi làm bộ (soạn tay, chờ soát ở 4.3)
 *       du-lieu/chu-han.json               2.668 chữ HSK 1–6, bộ theo kRSUnicode
 *       du-lieu/bo-thu-vi-du-them.txt      ví dụ soạn tay cho 11 bộ không có chữ HSK nào
 *       du-lieu/bo-thu-chiet-tu.txt        câu chiết tự nhớ nhanh (bước 4.2, soạn tay, chờ soát ở 4.3)
 * Ghi:  du-lieu/bo-thu.json                dữ liệu cho sổ tay
 *       du-lieu/bo-thu-xem.csv             bảng xem nhanh (mở bằng Excel)
 *       du-lieu/chiet-tu-can-soat.csv      bảng để người dùng soát tên và câu chiết tự (4.3); đã có thì không ghi đè
 */
const fs = require('fs');
const argRoot = process.argv.indexOf('--root');
const ROOT = argRoot > 0 ? process.argv[argRoot + 1] : 'D:/private/voc-lang-tai-lieu';
const MAX_EX = 5;
const cp = h => String.fromCodePoint(parseInt(h, 16));

// 1. Chữ bộ và dạng giản thể
const rad = {};
for (const line of fs.readFileSync(ROOT + '/_nguon/unihan/CJKRadicals.txt', 'utf8').split('\n')) {
  const m = line.match(/^(\d+)('*);\s*([0-9A-F]*);\s*([0-9A-F]+)/);
  if (!m) continue;
  const n = +m[1], r = (rad[n] ||= { no: n, char: '', simplified: [] });
  const ch = cp(m[4]);
  if (!m[2]) r.char = ch; else if (ch.codePointAt(0) <= 0xFFFF) r.simplified.push(ch);   // bỏ chữ ngoài BMP: font thường không có
}

// 2. Số nét: bộ Khang Hy theo số nét chuẩn của bộ (kTotalStrokes của chữ đứng riêng có thể khác, vd. 辵 7, 艸 6);
//    dạng giản thể lấy theo Unihan
const STROKE_FROM = [[1, 1], [7, 2], [30, 3], [61, 4], [95, 5], [118, 6], [147, 7], [167, 8], [176, 9], [185, 10], [195, 11], [201, 12], [205, 13], [209, 14], [211, 15], [212, 16], [214, 17]];
const radStrokes = n => STROKE_FROM.filter(([from]) => n >= from).pop()[1];
const strokes = {};
for (const line of fs.readFileSync(ROOT + '/_nguon/unihan/Unihan_IRGSources.txt', 'utf8').split('\n')) {
  const m = line.match(/^U\+([0-9A-F]+)\tkTotalStrokes\t(\d+)/);
  if (m) strokes[cp(m[1])] = +m[2];
}

// 3. Tên, nghĩa, biến thể
for (const line of fs.readFileSync(ROOT + '/du-lieu/bo-thu-ten.txt', 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [no, name, meaning, variants] = line.split('|');
  const r = rad[+no];
  if (!r) throw new Error('Không có bộ số ' + no);
  Object.assign(r, { name: name.trim(), meaning: meaning.trim(), variants: (variants || '').split(',').map(s => s.trim()).filter(Boolean) });
}

// 3b. Câu chiết tự
const mnemonic = {};
for (const line of fs.readFileSync(ROOT + '/du-lieu/bo-thu-chiet-tu.txt', 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const i = line.indexOf('|');
  mnemonic[+line.slice(0, i)] = line.slice(i + 1).trim();
}

// 4. Chữ HSK theo bộ (kRSUnicode "120'.3" → bộ 120)
const chars = JSON.parse(fs.readFileSync(ROOT + '/du-lieu/chu-han.json', 'utf8'));
const byRad = {};
for (const c of chars) {
  const n = parseInt(c.rsUnicode, 10);
  if (n) (byRad[n] ||= []).push(c);
}

// 5. Ví dụ thêm cho bộ không có chữ HSK nào (soạn tay): chữ HSK chứa thành phần đó, hoặc chữ ngoài HSK
const charMap = Object.fromEntries(chars.map(c => [c.char, c]));
const extra = {};
for (const line of fs.readFileSync(ROOT + '/du-lieu/bo-thu-vi-du-them.txt', 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [no, ch, py, hv, note] = line.split('|').map(s => s.trim());
  const c = charMap[ch];
  if (!c && !py) throw new Error('Ví dụ thêm ' + ch + ': không có trong HSK, cần ghi pinyin');
  (extra[+no] ||= []).push({ char: ch, pinyin: py || c.pinyin[0], hanViet: hv || c.hanViet[0] || '', level: c ? c.level : null,
    word: c && c.words[0] ? c.words[0].hanzi + ' — ' + c.words[0].vi : '', note });
}

const out = [], problems = [];
for (let n = 1; n <= 214; n++) {
  const r = rad[n];
  if (!r || !r.char) { problems.push(n + ': thiếu chữ bộ'); continue; }
  if (!r.name) problems.push(n + ': thiếu tên');
  const list = (byRad[n] || []).sort((a, b) => a.level - b.level || a.order - b.order);
  out.push({
    no: n, char: r.char, simplified: r.simplified.map(ch => ({ char: ch, strokes: strokes[ch] || null })), variants: r.variants || [],
    strokes: radStrokes(n), name: r.name, meaning: r.meaning,
    mnemonic: mnemonic[n] || '',
    hskCount: list.length,
    examples: list.length ? list.slice(0, MAX_EX).map(c => ({ char: c.char, pinyin: c.pinyin[0], hanViet: c.hanViet[0] || '', level: c.level, word: c.words[0] ? c.words[0].hanzi + ' — ' + c.words[0].vi : '' }))
      : (extra[n] || [])
  });
  if (!list.length && !extra[n]) problems.push(n + ': chưa có ví dụ');
  if (!mnemonic[n]) problems.push(n + ': chưa có câu chiết tự');
}
fs.writeFileSync(ROOT + '/du-lieu/bo-thu.json', JSON.stringify(out, null, 1));

const q = s => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const csv = [['Số', 'Bộ', 'Giản thể', 'Biến thể', 'Số nét', 'Tên Hán-Việt', 'Nghĩa', 'Số chữ HSK', 'Chữ ví dụ'].join(',')]
  .concat(out.map(r => [r.no, r.char, r.simplified.map(x => x.char + (x.strokes ? '(' + x.strokes + ')' : '')).join(' '), r.variants.join(' '), r.strokes, r.name, r.meaning, r.hskCount,
    r.examples.map(e => `${e.char} ${e.pinyin} (${e.hanViet})` + (e.note ? ' [' + e.note + ']' : '')).join('; ')].map(v => q(String(v ?? ''))).join(',')));
fs.writeFileSync(ROOT + '/du-lieu/bo-thu-xem.csv', '\ufeff' + csv.join('\r\n'));

// B\u1ea3ng so\u00e1t (4.3): kh\u00f4ng ghi \u0111\u00e8 khi ng\u01b0\u1eddi d\u00f9ng \u0111\u00e3 c\u00f3 b\u1ea3n \u0111ang so\u00e1t
const REVIEW = ROOT + '/du-lieu/chiet-tu-can-soat.csv';
const reviewNew = !fs.existsSync(REVIEW);
if (reviewNew) {
  const review = [['S\u1ed1', 'B\u1ed9', 'D\u1ea1ng kh\u00e1c', 'T\u00ean H\u00e1n-Vi\u1ec7t', 'Ngh\u0129a', 'C\u00e2u chi\u1ebft t\u1ef1', 'Ch\u1eef v\u00ed d\u1ee5', '\u00dd ki\u1ebfn c\u1ee7a b\u1ea1n (\u0111\u1ec3 tr\u1ed1ng = \u0111\u1ed3ng \u00fd)'].join(',')]
    .concat(out.map(r => [r.no, r.char, r.simplified.map(x => x.char).concat(r.variants).join(' '), r.name, r.meaning, r.mnemonic,
      r.examples.slice(0, 3).map(e => e.char).join(' '), ''].map(v => q(String(v ?? ''))).join(',')));
  fs.writeFileSync(REVIEW, '\ufeff' + review.join('\r\n'));
}

// Tóm tắt
const none = out.filter(r => !r.hskCount), few = out.filter(r => r.hskCount > 0 && r.hskCount < 3);
const diff = out.filter(r => strokes[r.char] && strokes[r.char] !== r.strokes).map(r => r.char + ' ' + strokes[r.char] + '→' + r.strokes);
console.log('Bộ:', out.length, '| có tên:', out.filter(r => r.name).length, '| có số nét:', out.filter(r => r.strokes).length,
  '\n  Số nét bộ khác chữ đứng riêng (Unihan→bộ):', diff.join(', ') || 'không');
console.log('Chữ HSK 1–6 được xếp vào bộ:', Object.values(byRad).reduce((s, l) => s + l.length, 0), '/', chars.length);
console.log('Bộ có ≥ 3 chữ HSK:', out.length - none.length - few.length, '| 1–2 chữ:', few.length, '| không có chữ HSK nào:', none.length);
console.log('  Không có chữ HSK:', none.map(r => r.no + ' ' + r.char + ' ' + r.name).join(', '));
console.log('Có dạng giản thể:', out.filter(r => r.simplified.length).length, '| có biến thể khi làm bộ:', out.filter(r => r.variants.length).length);
if (problems.length) console.log('Vấn đề:', problems.join('; '));
const lens = out.map(r => r.mnemonic.split(/\s+/).length).sort((a, b) => a - b);
console.log('Câu chiết tự:', out.filter(r => r.mnemonic).length, '/ 214 | số chữ mỗi câu: ngắn nhất', lens[0], '· trung vị', lens[107], '· dài nhất', lens[213]);
console.log('→', ROOT + '/du-lieu/bo-thu.json + bo-thu-xem.csv' + (reviewNew ? ' + chiet-tu-can-soat.csv' : ' (chiet-tu-can-soat.csv đã có, giữ nguyên)'));
