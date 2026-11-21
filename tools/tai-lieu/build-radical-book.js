/*
 * Bước 4.4 — Sổ tay 214 bộ thủ (gói 3), A4, mỗi trang 3 bộ.
 *
 *   node tools/tai-lieu/build-radical-book.js --from 61 --count 9 --pdf --png   bản mẫu → _tam/so-tay-bo-thu-mau.*
 *   node tools/tai-lieu/build-radical-book.js --pdf                             cả sổ → so-tay-bo-thu/So-tay-214-bo-thu.*
 *
 * Đọc du-lieu/bo-thu.json (build-radicals.js) và nét chữ Make Me a Hanzi (_nguon/makemeahanzi/graphics.txt).
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ROOT = path.resolve(arg('root') || 'D:/private/voc-lang-tai-lieu');
const FROM = +(arg('from') || 1), COUNT = +(arg('count') || 214);
const full = FROM === 1 && COUNT >= 214;
const OUT = path.join(ROOT, full ? 'so-tay-bo-thu/So-tay-214-bo-thu.html' : '_tam/so-tay-bo-thu-mau.html');
const PER_PAGE = 3, TRACE = 16;
// Dạng giản thể chỉ dùng khi làm bộ (chữ đứng riêng vẫn viết dạng cũ: 言, 糸, 金, 食, 爿)
const COMPONENT_ONLY = ['讠', '纟', '钅', '饣', '丬'];
// Dạng chuẩn hiện nay ở Trung Quốc đại lục của chữ bộ Khang Hy (không phải dạng khi làm bộ)
const MODERN = { 戶: '户', 靑: '青' };
// Chữ bộ gần như chỉ xuất hiện ở dạng khi làm bộ → tập viết dạng đó thay cho chữ gốc
const AS_COMPONENT = { 辵: '辶', 艸: '艹', 攴: '攵', 阜: '阝', 襾: '覀' };

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'du-lieu', 'bo-thu.json'), 'utf8'));
const rads = all.filter(r => r.no >= FROM && r.no < FROM + COUNT);

/* ---------- Nét chữ ---------- */
const need = new Set();
for (const r of rads) [r.char, ...r.simplified.map(x => x.char), ...r.variants.map(x => x.char), ...r.examples.map(e => e.char)].forEach(c => need.add(c));
const strokes = new Map();
for (const line of fs.readFileSync(path.join(ROOT, '_nguon', 'makemeahanzi', 'graphics.txt'), 'utf8').split('\n')) {
  if (!line) continue;
  const c = line.slice(14, line.indexOf('"', 14));
  if (need.has(c)) strokes.set(c, JSON.parse(line).strokes);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const upper = s => s.toLocaleUpperCase('vi');
function glyph(ch, { color = '#1F2937', upto, hi = -1, rest = null } = {}) {
  const st = strokes.get(ch);
  if (!st) return '<span class="zh fb">' + esc(ch) + '</span>';          // không có nét → dùng phông chữ
  const n = upto == null ? st.length : upto;
  const paths = st.map((d, i) => i >= n ? (rest ? '<path d="' + d + '" fill="' + rest + '"/>' : '')
    : '<path d="' + d + '" fill="' + (i === hi ? 'var(--hi)' : color) + '"/>').join('');
  return '<svg viewBox="0 0 1024 1024" class="g"><g transform="scale(1,-1) translate(0,-900)">' + paths + '</g></svg>';
}
const order = ch => (strokes.get(ch) || []).map((_, i) => '<span class="so">' + glyph(ch, { upto: i + 1, hi: i, rest: '#E5E7EB' }) + '</span>').join('');
// Nghĩa ngắn cho ô ví dụ: bỏ phần sau ";" hoặc "(", dài quá thì chỉ giữ ý đầu (trước dấu phẩy)
function shortVi(v) {
  let s = String(v || '').split(/[;(]/)[0].trim();
  if (s.length > 26 && s.includes(',')) s = s.split(',')[0].trim();
  return s;
}

/* Hai dạng người học chữ giản thể thật sự viết: A = chữ đứng riêng (giản thể nếu bộ đã giản hóa cả chữ, vd. 見→见),
 * B = dạng khi làm bộ (忄, 扌, 讠…). Thứ tự nét, ô tập viết và ô "24 bộ nên học trước" dùng A và B. */
const formsOf = r => r.simplified.map(x => ({ ...x, kind: COMPONENT_ONLY.includes(x.char) ? 'giản thể, khi làm bộ' : 'giản thể' }))
  .concat(r.variants.map(x => ({ ...x, kind: MODERN[r.char] === x.char ? 'dạng chuẩn hiện nay' : 'khi làm bộ' })));
function learnForms(r) {
  const s0 = (r.simplified[0] || {}).char;
  const A = AS_COMPONENT[r.char] || MODERN[r.char] || (s0 && !COMPONENT_ONLY.includes(s0) ? s0 : r.char);
  const B = formsOf(r).map(f => f.char).find(c => c !== A && strokes.has(c));
  return { A, B };
}

/* ---------- Thẻ một bộ ---------- */
function card(r) {
  const forms = formsOf(r);
  const formHtml = forms.length
    ? forms.map(f => '<span class="form"><span class="fg">' + glyph(f.char) + '</span><span><b>' + f.strokes + ' nét</b><i>' + f.kind + '</i></span></span>').join('')
    : '<span class="none">Không có dạng khác</span>';
  const { A, B } = learnForms(r);
  const orders = [A, B].filter(Boolean).map(c => '<div class="ord"><span class="ol zh">' + esc(c) + '</span>' + order(c) + '</div>').join('');
  const exHead = r.hskCount
    ? 'Chữ HSK 1–6 thuộc bộ này <span>(' + r.hskCount + ' chữ' + (r.hskCount > r.examples.length ? ', tiêu biểu ' + r.examples.length : '') + ')</span>'
    : 'Chữ tham khảo <span>(chưa có chữ HSK 1–6 nào xếp vào bộ này)</span>';
  const ex = r.examples.map(e => '<div class="ex"><span class="exg">' + glyph(e.char) + '</span><div class="exm">' +
    '<div><b class="py">' + esc(e.pinyin) + '</b> <span class="hv">' + esc(upper(e.hanViet)) + '</span></div>' +
    (e.word ? '<div class="exw"><span class="zh">' + esc(e.word.split(' — ')[0]) + '</span> ' + esc(shortVi(e.word.split(' — ')[1])) + '</div>' : '') +
    (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</div></div>').join('');
  const half = B ? TRACE / 2 : TRACE;
  const trace = Array.from({ length: TRACE }, (_, i) => {
    const c = i < half ? A : B, k = i < half ? i : i - half;
    return '<span class="mi">' + (k < 3 ? glyph(c, { color: k === 0 ? '#9CA3AF' : '#D1D5DB' }) : '') + '</span>';
  }).join('');
  return '<section class="card" id="b' + r.no + '">' +
    '<div class="top">' +
      '<div class="big"><span class="mi lg">' + glyph(r.char) + '</span><span class="no">#' + r.no + '</span></div>' +
      '<div class="head">' +
        '<div class="t1"><span class="name">' + esc(upper(r.name)) + '</span><span class="rpy">' + esc(r.pinyin) + '</span><span class="st">' + r.strokes + ' nét</span></div>' +
        '<div class="mean">' + esc(r.meaning) + '</div>' +
        '<div class="forms">' + formHtml + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mn"><b>Nhớ nhanh</b> ' + esc(r.mnemonic) + '</div>' +
    '<div class="orders">' + orders + '</div>' +
    '<div class="exh">' + exHead + '</div><div class="exs' + (r.examples.some(e => e.note) ? ' wide' : '') + '">' + ex + '</div>' +
    '<div class="trace">' + trace + '</div>' +
  '</section>';
}

/* ---------- Trang ---------- */
let pageNo = 0;
const page = (body, right, cls = '') => '<div class="page ' + cls + '"><header><span class="brand"><span class="logo">学</span>Voc-Lang · Sổ tay 214 bộ thủ</span><span>' + esc(right || '') + '</span></header>' +
  '<main>' + body + '</main><footer>' + (++pageNo) + '</footer></div>';
let pages = '';

/* ---------- Bìa, hướng dẫn, mục lục (chỉ bản đầy đủ) ---------- */
const FRONT = full ? 4 : 0;                                   // bìa, hướng dẫn, 2 trang mục lục
const pageOf = r => FRONT + Math.floor((r.no - FROM) / PER_PAGE) + 1;
if (full) {
  const totalHsk = all.reduce((s, r) => s + r.hskCount, 0);
  pages += '<div class="page cover"><main>' +
    '<div class="cv-top"><span class="logo big">学</span><span class="cv-brand">Voc-Lang</span></div>' +
    '<div class="cv-glyph zh">部首</div>' +
    '<h1>Sổ tay 214 bộ thủ</h1>' +
    '<p class="cv-sub">Bộ thủ Khang Hy · tên Hán-Việt · câu nhớ nhanh · thứ tự nét<br>kèm ' + totalHsk.toLocaleString('vi-VN') + ' chữ Hán HSK 1–6 xếp theo bộ</p>' +
    '</main><footer></footer></div>';
  pageNo++;

  const top = all.slice().sort((a, b) => b.hskCount - a.hskCount).slice(0, 24);
  const guide =
    '<h2>Cách dùng sổ tay</h2>' +
    '<h3>Bộ thủ là gì?</h3>' +
    '<p>Bộ thủ là thành phần dùng để xếp và tra chữ Hán. Mỗi chữ thuộc một bộ, và bộ thường gợi ý nghĩa của chữ: chữ có bộ ' +
      '<b class="zh">氵</b> (nước) hay nói về nước (<span class="zh">河 海 洗</span>), chữ có bộ <b class="zh">讠</b> (lời nói) hay nói về lời nói (<span class="zh">说 话 读</span>). ' +
      'Sổ tay dùng hệ <b>214 bộ của từ điển Khang Hy</b> (1716), xếp theo số nét từ 1 đến 17.</p>' +
    '<h3>Dạng giản thể và dạng khi làm bộ</h3>' +
    '<p>Nhiều bộ đổi hình khi đứng trong chữ: <span class="zh">水 → 氵</span>, <span class="zh">手 → 扌</span>, <span class="zh">心 → 忄</span>, <span class="zh">人 → 亻</span>. ' +
      'Một số bộ có dạng giản thể dùng ở Trung Quốc đại lục: <span class="zh">言 → 讠</span>, <span class="zh">見 → 见</span>, <span class="zh">門 → 门</span>. ' +
      'Mỗi thẻ ghi đủ các dạng này kèm số nét. Phần thứ tự nét và ô tập viết dùng đúng dạng bạn sẽ viết trong chữ giản thể.</p>' +
    '<h3>Đọc một thẻ</h3>' +
    '<ol class="steps"><li><b>Ô chữ lớn:</b> chữ bộ và số thứ tự Khang Hy.</li>' +
      '<li><b>Tên Hán-Việt, pinyin, số nét, nghĩa</b> của bộ.</li>' +
      '<li><b>Dạng khác:</b> dạng giản thể và dạng khi làm bộ, kèm số nét.</li>' +
      '<li><b>Nhớ nhanh:</b> một câu nói hình dạng của bộ gợi ra nghĩa gì.</li>' +
      '<li><b>Thứ tự nét:</b> mỗi ô thêm một nét, nét mới tô đỏ.</li>' +
      '<li><b>Chữ HSK 1–6 thuộc bộ:</b> tổng số chữ và tối đa 5 chữ tiêu biểu, có pinyin, âm Hán-Việt và một từ ví dụ.</li>' +
      '<li><b>Hàng tập viết:</b> tô theo 3 ô chữ mờ rồi tự viết ở các ô trống.</li></ol>' +
    '<h3>Nên học bộ nào trước?</h3>' +
    '<p>24 bộ dưới đây chứa nhiều chữ HSK 1–6 nhất. Nắm chắc chúng là đọc được bộ của gần ' +
      Math.round(top.reduce((s, r) => s + r.hskCount, 0) / totalHsk * 100) + '% số chữ:</p>' +
    '<div class="top24">' + top.map(r => {
      // Hiện dạng người học hay gặp trong chữ giản thể (vd. 艸 → 艹 · 辵 → 辶), thêm dạng khi làm bộ nếu có
      const { A, B } = learnForms(r);
      return '<a href="#b' + r.no + '"><b class="zh">' + esc(A) + (B ? '<small> ' + esc(B) + '</small>' : '') + '</b><span>' + esc(r.name) +
        '</span><i>#' + r.no + ' · ' + r.hskCount + ' chữ</i></a>';
    }).join('') + '</div>' +
    '<h3>Cách tra chữ bằng bộ thủ</h3>' +
    '<p>Từ điển giấy và nhiều ứng dụng từ điển cho tra chữ theo bộ. Ví dụ tra chữ <b class="zh">妈</b> (mẹ):</p>' +
    '<ol class="steps">' +
      '<li><b>Tìm bộ.</b> Bên trái là <span class="zh">女</span> (nữ), gợi nghĩa người phụ nữ → bộ <b>Nữ</b>, 3 nét (thẻ #38).</li>' +
      '<li><b>Đếm nét phần còn lại.</b> Phần bên phải <span class="zh">马</span> có 3 nét.</li>' +
      '<li><b>Tra.</b> Mở mục lục bộ thủ của từ điển, chọn bộ <span class="zh">女</span>, xem nhóm "3 nét" là thấy <span class="zh">妈</span>.</li></ol>' +
    '<p><b>Bộ thường nằm ở đâu?</b> Bên trái (<span class="zh">亻 氵 扌 讠</span>), trên đầu (<span class="zh">艹 宀 ⺮</span>: <span class="zh">家</span> thuộc bộ <span class="zh">宀</span>), ' +
      'phía dưới (<span class="zh">心 灬</span>: <span class="zh">想</span> thuộc bộ <span class="zh">心</span>), hoặc bao bên ngoài (<span class="zh">囗 门</span>). ' +
      'Khi chữ có nhiều phần, bộ thường là phần mang nghĩa, phần còn lại thường gợi âm đọc.</p>' +
    '<p class="muted">Lưu ý: chữ được xếp vào bộ theo từ điển Khang Hy (dữ liệu Unicode). Vài từ điển giản thể hiện đại xếp khác một số chữ, ví dụ <span class="zh">将</span> nằm ở bộ <span class="zh">丬</span> thay vì bộ <span class="zh">寸</span>.</p>';
  pages += page(guide, 'Hướng dẫn', 'content');

  const byStroke = {};
  all.forEach(r => (byStroke[r.strokes] ||= []).push(r));
  const idx = keys => keys.map(s => '<div class="ix-g"><div class="ix-h">' + s + ' nét</div><div class="ix-l">' +
    byStroke[s].map(r => '<a href="#b' + r.no + '"><span class="ix-no">' + r.no + '</span><b class="zh">' + esc(r.char) + '</b><span class="ix-n">' + esc(r.name) +
      '</span><span class="ix-p">' + pageOf(r) + '</span></a>').join('') + '</div></div>').join('');
  const strokesList = Object.keys(byStroke).map(Number).sort((a, b) => a - b);
  pages += page('<h2>Mục lục 214 bộ theo số nét</h2>' + idx(strokesList.filter(s => s <= 5)), 'Mục lục', 'content');
  pages += page(idx(strokesList.filter(s => s > 5)), 'Mục lục', 'content');
}

for (let i = 0; i < rads.length; i += PER_PAGE) {
  const group = rads.slice(i, i + PER_PAGE);
  const st = [...new Set(group.map(r => r.strokes))].map(s => s + ' nét').join(' · ');
  pages += page(group.map(card).join(''), 'Bộ ' + group[0].no + (group.length > 1 ? '–' + group[group.length - 1].no : '') + ' · ' + st);
}
if (full) {
  pages += page('<h2>Nguồn dữ liệu</h2><ul class="credits">' +
    '<li>Bộ thủ Khang Hy, dạng giản thể, số nét, cách xếp chữ vào bộ và pinyin: <b>Unicode Unihan</b> và <b>CJKRadicals</b> (Unicode License v3).</li>' +
    '<li>Hình nét và thứ tự nét: <b>Make Me a Hanzi</b> (Arphic Public License).</li>' +
    '<li>Âm Hán-Việt tham khảo: Unicode Unihan, từ điển Thiều Chửu.</li>' +
    '<li>Danh sách chữ và từ HSK 1–6, tên bộ, nghĩa, câu nhớ nhanh: Voc-Lang biên soạn.</li></ul>' +
    '<p class="muted">Tài liệu dành cho người mua dùng cá nhân. Vui lòng không chia sẻ lại hoặc đăng tải công khai.</p>', 'Nguồn dữ liệu', 'content');
}

const css = `
@page { size: A4; margin: 0; }
:root { --ink: #1F2937; --muted: #6B7280; --jade: #0F766E; --jade-50: #ECFDF5; --line: #E5E7EB; --hi: #E11D48; --grid: #F3B4C0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #e5e7eb; }
body { font-family: "Be Vietnam Pro", "Segoe UI", sans-serif; color: var(--ink); }
.zh { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; font-weight: 500; }
.page { width: 210mm; height: 297mm; padding: 8mm 11mm 6mm; margin: 0 auto 8mm; background: #fff; display: flex; flex-direction: column; overflow: hidden; break-after: page; }
@media print { html, body { background: #fff; } .page { margin: 0; } }
header { flex: none; height: 7mm; display: flex; align-items: center; justify-content: space-between; border-bottom: 0.3mm solid var(--line); font-size: 8.5pt; color: var(--muted); }
.brand { display: inline-flex; align-items: center; gap: 1.5mm; font-weight: 700; color: var(--jade); }
.logo { display: inline-grid; place-items: center; width: 4.6mm; height: 4.6mm; border-radius: 1.2mm; background: var(--jade); color: #fff; font: 600 7pt "Noto Sans SC", sans-serif; }
main { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 3mm; padding-top: 3mm; overflow: hidden; }
footer { flex: none; height: 5mm; text-align: center; font-size: 8pt; color: var(--muted); padding-top: 1.5mm; }
.g { width: 100%; height: 100%; display: block; }
.cover main { justify-content: center; align-items: center; text-align: center; gap: 6mm; }
.cv-top { display: flex; align-items: center; gap: 3mm; }
.logo.big { width: 11mm; height: 11mm; border-radius: 3mm; font-size: 17pt; }
.cv-brand { font-size: 20pt; font-weight: 800; color: var(--jade); }
.cv-glyph { font-size: 80pt; line-height: 1; margin: 10mm 0 2mm; color: var(--jade); }
h1 { margin: 0; font-size: 28pt; font-weight: 800; }
.cv-sub { margin: 0; font-size: 11.5pt; color: var(--muted); line-height: 1.6; }
.content main { display: block; }
h2 { margin: 1mm 0 3mm; font-size: 16pt; }
h3 { margin: 4.5mm 0 1.5mm; font-size: 11.5pt; color: var(--jade); }
p { margin: 0 0 2mm; font-size: 10pt; line-height: 1.55; }
.muted { color: var(--muted); font-size: 9pt; }
.steps { margin: 0; padding-left: 5mm; font-size: 10pt; line-height: 1.6; }
.credits { font-size: 10pt; line-height: 1.7; padding-left: 5mm; }
.top24 { display: grid; grid-template-columns: repeat(8, 1fr); gap: 1.5mm; margin: 1mm 0 3mm; }
.top24 a, .ix-l a { text-decoration: none; color: var(--ink); }
.top24 a { display: flex; flex-direction: column; align-items: center; padding: 1mm 0; border: 0.25mm solid var(--line); border-radius: 1.5mm; }
.top24 b { font-size: 16pt; line-height: 1.2; }
.top24 small { font-size: 12pt; color: var(--jade); }
.top24 span { font-size: 7.5pt; font-weight: 600; }
.top24 i { font-size: 6.5pt; color: var(--muted); font-style: normal; }
.ix-g { margin-bottom: 2.5mm; break-inside: avoid; }
.ix-h { font-size: 9.5pt; font-weight: 700; color: var(--jade); border-bottom: 0.3mm solid var(--line); margin-bottom: 1mm; padding-bottom: 0.5mm; }
.ix-l { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.6mm 2mm; }
.ix-l a { display: flex; align-items: baseline; gap: 1.2mm; font-size: 8pt; line-height: 1.5; }
.ix-no { width: 5.5mm; text-align: right; color: var(--muted); font-size: 7pt; }
.ix-l b { font-size: 11pt; font-weight: 500; }
.ix-n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-p { color: var(--muted); font-size: 7pt; }
.fb { display: grid; place-items: center; width: 100%; height: 100%; font-size: 1em; line-height: 1; }

.card { flex: 0 0 calc((100% - 6mm) / 3); min-height: 0; border: 0.3mm solid var(--line); border-radius: 2.5mm; padding: 3mm 3.5mm; display: flex; flex-direction: column; gap: 1.8mm; overflow: hidden; }
.top { display: flex; gap: 4mm; }
.big { position: relative; flex: none; }
.mi { position: relative; display: inline-block; border: 0.25mm solid var(--grid); background:
  linear-gradient(to right, transparent calc(50% - 0.1mm), var(--grid) calc(50% - 0.1mm), var(--grid) calc(50% + 0.1mm), transparent calc(50% + 0.1mm)),
  linear-gradient(to bottom, transparent calc(50% - 0.1mm), var(--grid) calc(50% - 0.1mm), var(--grid) calc(50% + 0.1mm), transparent calc(50% + 0.1mm)); }
.mi.lg { width: 24mm; height: 24mm; padding: 1.5mm; font-size: 52pt; }
.no { position: absolute; top: -1.5mm; left: -1.5mm; padding: 0.3mm 1.6mm; border-radius: 1mm; background: var(--jade); color: #fff; font-size: 8pt; font-weight: 700; }
.head { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.2mm; }
.t1 { display: flex; align-items: baseline; gap: 3mm; }
.name { font-size: 17pt; font-weight: 800; color: var(--jade); letter-spacing: 0.02em; }
.rpy { font-size: 12pt; font-weight: 600; }
.st { margin-left: auto; font-size: 9pt; color: var(--muted); }
.mean { font-size: 10.5pt; }
.forms { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 0.5mm; }
.form { display: inline-flex; align-items: center; gap: 1.5mm; padding: 0.8mm 2.2mm 0.8mm 1mm; border: 0.25mm solid var(--line); border-radius: 1.5mm; }
.fg { width: 8mm; height: 8mm; font-size: 20pt; }
.form b { display: block; font-size: 8pt; }
.form i { display: block; font-size: 7pt; color: var(--muted); font-style: normal; }
.none { font-size: 8.5pt; color: var(--muted); }
.mn { padding: 1.6mm 2.5mm; border-radius: 1.5mm; background: var(--jade-50); font-size: 9.5pt; line-height: 1.45; }
.mn b { color: var(--jade); margin-right: 1mm; }
.orders { display: flex; flex-wrap: wrap; gap: 1mm 5mm; }
.ord { display: flex; align-items: center; gap: 0.8mm; }
.ol { font-size: 8pt; color: var(--muted); margin-right: 0.8mm; }
.so { width: 6.5mm; height: 6.5mm; border: 0.2mm solid var(--line); }
.exh { font-size: 8.5pt; font-weight: 700; }
.exh span { font-weight: 400; color: var(--muted); }
.exs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.5mm; }
.exs.wide { grid-template-columns: repeat(3, 1fr); gap: 1mm 3mm; }
.ex { display: flex; gap: 1.5mm; align-items: flex-start; min-width: 0; }
.exg { flex: none; width: 9mm; height: 9mm; font-size: 22pt; }
.exm { min-width: 0; font-size: 7.5pt; line-height: 1.3; }
.py { color: var(--jade); font-weight: 600; }
.hv { font-size: 7pt; color: var(--muted); letter-spacing: 0.02em; }
.exw .zh { font-weight: 500; }
.note { font-size: 6.8pt; color: var(--muted); font-style: italic; }
.trace { display: grid; grid-template-columns: repeat(${TRACE}, 1fr); margin-top: auto; border-left: 0.25mm solid var(--grid); }
.trace .mi { aspect-ratio: 1; padding: 0.8mm; border-left: 0; font-size: 24pt; }
`;

const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Sổ tay 214 bộ thủ · Voc-Lang</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@500;700&display=block">' +
  '<style>' + css + '</style></head><body>' + pages +
  '<script>document.fonts.ready.then(function () { var bad = []; document.querySelectorAll(".card, .content main").forEach(function (c, i) { if (c.scrollHeight > c.clientHeight + 1) bad.push(c.id || "trang-chu-" + i); }); document.title += bad.length ? " | TRÀN: " + bad.join(",") : " | OK"; });</script>' +
  '</body></html>';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('HTML:', OUT, '| bộ:', rads.length, '| trang:', pageNo);

/* ---------- Xuất PDF / ảnh xem trước bằng Chrome ---------- */
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const url = 'file:///' + OUT.replace(/\\/g, '/');
const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=30000', '--run-all-compositor-stages-before-draw'];
// Thẻ nào bị tràn khung thì báo (đọc tiêu đề trang sau khi phông đã tải)
const dom = execFileSync(CHROME, common.concat(['--dump-dom', url]), { encoding: 'utf8', maxBuffer: 1 << 28 });
console.log('Kiểm tra tràn:', (dom.match(/<title>[^<]*\| ([^<]*)<\/title>/) || [])[1] || '?');
if (arg('pdf')) {
  const pdf = OUT.replace(/\.html$/, '.pdf');
  execFileSync(CHROME, common.concat(['--no-pdf-header-footer', '--print-to-pdf=' + pdf, url]), { stdio: 'ignore' });
  console.log('PDF:', pdf, Math.round(fs.statSync(pdf).size / 1024) + ' KB');
}
if (arg('png')) {
  const png = OUT.replace(/\.html$/, '.png');
  execFileSync(CHROME, common.concat(['--window-size=840,' + (1153 * Math.min(pageNo, 3)), '--screenshot=' + png, url]), { stdio: 'ignore' });
  console.log('PNG:', png);
}
