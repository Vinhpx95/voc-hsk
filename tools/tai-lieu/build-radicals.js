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
  // Không dấu ' = chữ bộ Khang Hy; một dấu ' = giản thể Trung Quốc; hai dấu '' = dạng chữ Nhật (bỏ); bỏ cả chữ ngoài BMP
  if (!m[2]) r.char = ch; else if (m[2] === "'" && ch.codePointAt(0) <= 0xFFFF) r.simplified.push(ch);
}

// 2. Số nét: bộ Khang Hy theo số nét chuẩn của bộ (kTotalStrokes của chữ đứng riêng có thể khác, vd. 辵 7, 艸 6);
//    dạng giản thể lấy theo Unihan
const STROKE_FROM = [[1, 1], [7, 2], [30, 3], [61, 4], [95, 5], [118, 6], [147, 7], [167, 8], [176, 9], [187, 10], [195, 11], [201, 12], [205, 13], [209, 14], [211, 15], [212, 16], [214, 17]];
const radStrokes = n => STROKE_FROM.filter(([from]) => n >= from).pop()[1];
const strokes = {};
for (const line of fs.readFileSync(ROOT + '/_nguon/unihan/Unihan_IRGSources.txt', 'utf8').split('\n')) {
  const m = line.match(/^U\+([0-9A-F]+)\tkTotalStrokes\t(\d+)/);
  if (m) strokes[cp(m[1])] = +m[2];
}

// 2b. Pinyin của chữ bộ (kMandarin)
const mandarin = {};
for (const line of fs.readFileSync(ROOT + '/_nguon/unihan/Unihan_Readings.txt', 'utf8').split('\n')) {
  const m = line.match(/^U\+([0-9A-F]+)\tkMandarin\t(\S+)/);
  if (m) mandarin[cp(m[1])] = m[2];
}
// kMandarin cho âm thông dụng nhất của chữ; khi làm bộ thì đọc theo nghĩa của bộ (khớp tên Hán-Việt)
Object.assign(mandarin, { 卜: 'bǔ', 凵: 'kǎn', 厂: 'hàn', 干: 'gān', 广: 'yǎn', 長: 'cháng', 鬲: 'lì', 黽: 'mǐn',
  爿: 'qiáng', 隶: 'dài', 艮: 'gèn', 几: 'jī' });

// 3. Tên, nghĩa, biến thể
for (const line of fs.readFileSync(ROOT + '/du-lieu/bo-thu-ten.txt', 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [no, name, meaning, variants] = line.split('|');
  const r = rad[+no];
  if (!r) throw new Error('Không có bộ số ' + no);
  // Biến thể ghi "亻:2" (số nét theo chuẩn đại lục, vì Unihan cho số nét kiểu phồn thể: 辶 4, 艹 4, 阝 3…)
  const vs = (variants || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [char, st] = s.split(':');
    if (!st) throw new Error('Bộ ' + no + ': biến thể ' + char + ' thiếu số nét');
    return { char, strokes: +st };
  });
  Object.assign(r, { name: name.trim(), meaning: meaning.trim(), variants: vs });
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

/* Chữ ví dụ đa âm: pinyin, âm Hán-Việt và từ minh họa phải cùng một cách đọc.
 * Cách đọc chính = cách đọc có nhiều từ HSK nhất (bằng nhau thì ưu tiên có dấu thanh), trừ vài chữ ghi đè bên dưới. */
const READING_OVERRIDE = { 儿: 'ér', 姐: 'jiě', 子: 'zǐ', 行: 'xíng', 长: 'cháng', 累: 'lèi',
  一: 'yī', 了: 'le', 兴: 'xìng', 得: 'de', 都: 'dōu', 给: 'gěi' };
// Âm Hán-Việt theo cách đọc (Thiều Chửu), cho chữ có nhiều âm Hán-Việt hoặc âm phụ thuộc nghĩa
const HV_BY_READING = {
  中: { zhōng: 'trung', zhòng: 'trúng' }, 为: { wèi: 'vị', wéi: 'vi' }, 乐: { lè: 'lạc', yuè: 'nhạc' },
  兴: { xìng: 'hứng', xīng: 'hưng' }, 冠: { guàn: 'quán', guān: 'quan' }, 几: { jǐ: 'kỉ', jī: 'cơ' },
  分: { fēn: 'phân', fèn: 'phận' }, 处: { chǔ: 'xử', chù: 'xứ' }, 好: { hǎo: 'hảo', hào: 'hiếu' },
  将: { jiāng: 'tương', jiàng: 'tướng' }, 少: { shǎo: 'thiểu', shào: 'thiếu' }, 干: { gān: 'can', gàn: 'cán' },
  弹: { tán: 'đàn', dàn: 'đạn' }, 当: { dāng: 'đương', dàng: 'đáng' }, 教: { jiāo: 'giao', jiào: 'giáo' },
  散: { sàn: 'tán', sǎn: 'tản' }, 更: { gēng: 'canh', gèng: 'cánh' }, 相: { xiāng: 'tương', xiàng: 'tướng' },
  禁: { jìn: 'cấm', jīn: 'câm' }, 空: { kōng: 'không', kòng: 'khống' }, 累: { lèi: 'lụy', lěi: 'lũy' },
  舍: { shě: 'xả', shè: 'xá' }, 行: { xíng: 'hành', háng: 'hàng' }, 觉: { jué: 'giác', jiào: 'giáo' },
  重: { zhòng: 'trọng', chóng: 'trùng' }, 量: { liàng: 'lượng', liáng: 'lương' }, 长: { cháng: 'trường', zhǎng: 'trưởng' },
  间: { jiān: 'gian', jiàn: 'gián' }, 难: { nán: 'nan', nàn: 'nạn' }, 鲜: { xiān: 'tiên', xiǎn: 'tiển' },
  予: { yǔ: 'dữ' }, 参: { cān: 'tham' }
};
const TONED = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
function example(c) {
  const ph = c.pinyinHsk || {}, keys = Object.keys(ph);
  const py = READING_OVERRIDE[c.char] || (keys.length
    ? keys.slice().sort((a, b) => ph[b].length - ph[a].length || TONED.test(b) - TONED.test(a))[0]
    : c.pinyin[0]);
  // Từ minh họa: cùng cách đọc, ưu tiên từ 1–3 chữ, cấp thấp, ngắn (tránh thành ngữ dài khi có từ dễ hơn)
  const inReading = c.words.filter(x => (ph[py] || []).includes(x.hanzi));
  const pool = inReading.length ? inReading : c.words;
  const w = pool.slice().sort((a, b) => (a.hanzi.length > 3) - (b.hanzi.length > 3) || a.level - b.level || a.hanzi.length - b.hanzi.length)[0];
  const hv = (HV_BY_READING[c.char] || {})[py] || c.hanViet[0] || '';
  return { char: c.char, pinyin: py, hanViet: hv, level: c.level, word: w ? w.hanzi + ' — ' + w.vi : '' };
}

const out = [], problems = [];
for (let n = 1; n <= 214; n++) {
  const r = rad[n];
  if (!r || !r.char) { problems.push(n + ': thiếu chữ bộ'); continue; }
  if (!r.name) problems.push(n + ': thiếu tên');
  const list = (byRad[n] || []).sort((a, b) => a.level - b.level || a.order - b.order);
  out.push({
    no: n, char: r.char, simplified: r.simplified.map(ch => ({ char: ch, strokes: strokes[ch] || null })), variants: r.variants || [],
    strokes: radStrokes(n), pinyin: mandarin[r.char] || '', name: r.name, meaning: r.meaning,
    mnemonic: mnemonic[n] || '',
    hskCount: list.length,
    examples: list.length ? list.slice(0, MAX_EX).map(example)
      : (extra[n] || [])
  });
  if (!list.length && !extra[n]) problems.push(n + ': chưa có ví dụ');
  if (!mnemonic[n]) problems.push(n + ': chưa có câu chiết tự');
}
fs.writeFileSync(ROOT + '/du-lieu/bo-thu.json', JSON.stringify(out, null, 1));

const q = s => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const csv = [['Số', 'Bộ', 'Giản thể', 'Biến thể', 'Số nét', 'Tên Hán-Việt', 'Nghĩa', 'Số chữ HSK', 'Chữ ví dụ'].join(',')]
  .concat(out.map(r => [r.no, r.char, r.simplified.map(x => x.char + (x.strokes ? '(' + x.strokes + ')' : '')).join(' '), r.variants.map(x => x.char + '(' + x.strokes + ')').join(' '), r.strokes, r.name, r.meaning, r.hskCount,
    r.examples.map(e => `${e.char} ${e.pinyin} (${e.hanViet})` + (e.note ? ' [' + e.note + ']' : '')).join('; ')].map(v => q(String(v ?? ''))).join(',')));
fs.writeFileSync(ROOT + '/du-lieu/bo-thu-xem.csv', '\ufeff' + csv.join('\r\n'));

// B\u1ea3ng so\u00e1t (4.3): kh\u00f4ng ghi \u0111\u00e8 khi ng\u01b0\u1eddi d\u00f9ng \u0111\u00e3 c\u00f3 b\u1ea3n \u0111ang so\u00e1t
const REVIEW = ROOT + '/du-lieu/chiet-tu-can-soat.csv';
const reviewNew = !fs.existsSync(REVIEW);
if (reviewNew) {
  const review = [['S\u1ed1', 'B\u1ed9', 'D\u1ea1ng kh\u00e1c', 'T\u00ean H\u00e1n-Vi\u1ec7t', 'Ngh\u0129a', 'C\u00e2u chi\u1ebft t\u1ef1', 'Ch\u1eef v\u00ed d\u1ee5', '\u00dd ki\u1ebfn c\u1ee7a b\u1ea1n (\u0111\u1ec3 tr\u1ed1ng = \u0111\u1ed3ng \u00fd)'].join(',')]
    .concat(out.map(r => [r.no, r.char, r.simplified.concat(r.variants).map(x => x.char + (x.strokes ? '(' + x.strokes + ' nét)' : '')).join(' '), r.name, r.meaning, r.mnemonic,
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
