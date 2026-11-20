/*
 * Giai đoạn 2 — Vở luyện viết chữ Hán (HTML A4 → PDF bằng Chrome).
 *
 *   node tools/tai-lieu/build-workbook.js --level 1 [--limit 10] [--out file.html] [--pdf] [--png] [--root D:/private/voc-lang-tai-lieu]
 *
 * Mỗi trang 5 khối chữ. Khối: ô chữ mẫu + pinyin + âm Hán-Việt + số nét + bộ thủ + từ HSK + dãy thứ tự nét,
 * 1 hàng 11 ô điền mễ có chữ mờ để tô, 1 hàng 11 ô trống. Chữ mẫu, chữ mờ, thứ tự nét vẽ bằng chính dữ liệu nét
 * Make Me a Hanzi (SVG) → không phụ thuộc phông chữ Hán cho phần luyện viết.
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ROOT = path.resolve(opt('root') || 'D:/private/voc-lang-tai-lieu');
const LEVEL = +(opt('level') || 1);
const LIMIT = opt('limit') ? +opt('limit') : 0;
const PER_PAGE = 5, BOXES = 11;
const OUT = path.resolve(opt('out') || path.join(ROOT, '_tam', 'vo-luyen-viet-hsk' + LEVEL + (LIMIT ? '-mau' : '') + '.html'));

/* ---------- Dữ liệu ---------- */
const all = require(path.join(ROOT, 'du-lieu', 'chu-han.json'));
let chars = all.filter(c => c.level === LEVEL).sort((a, b) => a.order - b.order);
const totalInLevel = chars.length;
if (opt('from')) chars = chars.slice(Math.max(0, chars.findIndex(c => c.char === opt('from'))));   // --from 字: bắt đầu từ chữ này (xem thử)
if (LIMIT) chars = chars.slice(0, LIMIT);
const need = new Set(chars.map(c => c.char).concat(['学', '十', '人', '三', '川', '月', '国', '小', '水']));
const strokes = new Map();
for (const line of fs.readFileSync(path.join(ROOT, '_nguon', 'makemeahanzi', 'graphics.txt'), 'utf8').split('\n')) {
  if (!line) continue;
  const c = line.slice(14, line.indexOf('"', 14));          // {"character":"X",...
  if (need.has(c)) strokes.set(c, JSON.parse(line).strokes);
}

/* ---------- Tiện ích ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const upper = s => s.toLocaleUpperCase('vi');
/** Chữ vẽ bằng nét: upto = số nét hiện (mặc định tất cả), hi = vị trí nét tô màu nhấn */
function glyph(ch, { color = '#1F2937', upto, hi = -1, rest = null } = {}) {
  const st = strokes.get(ch) || [];
  const n = upto == null ? st.length : upto;
  const paths = st.map((d, i) => {
    if (i >= n) return rest ? '<path d="' + d + '" fill="' + rest + '"/>' : '';
    return '<path d="' + d + '" fill="' + (i === hi ? 'var(--hi)' : color) + '"/>';
  }).join('');
  return '<svg viewBox="0 0 1024 1024" class="g"><g transform="scale(1,-1) translate(0,-900)">' + paths + '</g></svg>';
}
/** Các cách đọc trong HSK, bỏ dạng thanh nhẹ khi đã có dạng có thanh của cùng âm tiết (谢谢 xièxie → chỉ xiè) */
const TB = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v' };
const plainPy = s => [...s].map(ch => TB[ch] || ch).join('');
function pinyinList(c) {
  const list = Object.entries(c.pinyinHsk || {}).sort((a, b) => b[1].length - a[1].length).map(e => e[0]);
  const toned = new Set(list.filter(p => plainPy(p) !== p).map(plainPy));
  return list.filter(p => plainPy(p) !== p || !toned.has(p)).slice(0, 3);
}
function shortVi(v) { return String(v || '').split(/[;(]/)[0].trim(); }
function wordList(c) {
  return c.words.slice().sort((a, b) => (a.hanzi.length > 1 ? 0 : 1) - (b.hanzi.length > 1 ? 0 : 1) || a.level - b.level)
    .slice(0, 3).map(w => '<span class="w"><b class="zh">' + esc(w.hanzi) + '</b> ' + esc(w.pinyin) + ' <i>' + esc(shortVi(w.vi)) + '</i></span>').join('');
}

/* Bộ thủ dạng "CJK Radicals Supplement" (⺅, ⺡…) nhiều phông không có → đổi sang chữ thường tương ứng */
const RADICAL = { '⺀': '冫', '⺅': '亻', '⺡': '氵', '⺘': '扌', '⺖': '忄', '⻖': '阝', '⻏': '阝', '⺨': '犭', '⺾': '艹', '⻌': '辶', '⻍': '辶',
  '⻎': '辶', '⺙': '攵', '⺣': '灬', '⺼': '月', '⺝': '月', '⺧': '牛', '⺩': '王', '⻂': '衤', '⻆': '角', '⺄': '乙', '⺊': '卜',
  '⻗': '雨', '⺮': '竹', '⻞': '食', '⻝': '食', '⻊': '足', '⺪': '疋', '⺈': '刀', '⺆': '冂', '⺌': '小', '⺍': '小', '⺗': '心',
  '⺜': '日', '⺦': '丬', '⺫': '罒', '⺲': '罒', '⺳': '罒', '⺶': '羊', '⺷': '羊', '⺻': '聿', '⺺': '聿', '⻀': '虫', '⻈': '讠',
  '⻓': '长', '⻔': '门', '⻘': '青', '⻙': '韦', '⻚': '页', '⻛': '风', '⻜': '飞', '⻠': '饣', '⻢': '马', '⻣': '骨', '⻤': '鬼',
  '⻥': '鱼', '⻦': '鸟', '⻧': '卤', '⻨': '麦', '⻩': '黄', '⻬': '齐', '⻮': '齿', '⻯': '龙', '⻰': '龙', '⻳': '龟', '⺋': '卩',
  '⺁': '厂', '⺇': '几', '⺉': '刂', '⺔': '彐', '⺕': '彐', '⺛': '旡', '⺟': '母', '⺠': '民', '⺢': '水', '⺤': '爫', '⺥': '爫',
  '⺭': '礻', '⺯': '糸', '⺰': '纟', '⺱': '冈', '⺸': '羊', '⺹': '耂', '⺿': '艹', '⻁': '虎', '⻃': '西', '⻄': '西', '⻅': '见',
  '⻇': '角', '⻉': '贝', '⻋': '车', '⻐': '钅', '⻒': '镸', '⻕': '门', '⻑': '長', '⻟': '食' };
const radicalOf = r => RADICAL[r] || r;

/* ---------- Khối chữ ---------- */
function block(c) {
  const st = strokes.get(c.char) || [];
  const order = st.map((_, i) => '<span class="so">' + glyph(c.char, { upto: i + 1, hi: i, rest: '#E5E7EB' }) + '</span>').join('');
  const trace = Array.from({ length: BOXES }, (_, i) => '<span class="mi">' + glyph(c.char, { color: i < 2 ? '#BFC4CB' : '#DDE1E6' }) + '</span>').join('');
  const blank = Array.from({ length: BOXES }, () => '<span class="mi"></span>').join('');
  return '<section class="blk">' +
    '<div class="info">' +
      '<span class="mi model">' + glyph(c.char) + '</span>' +
      '<div class="meta">' +
        '<div class="l1"><span class="py">' + esc(pinyinList(c).join(' / ')) + '</span>' +
          '<span class="hv">' + esc(c.hanViet.map(upper).join(' / ')) + '</span>' +
          '<span class="facts">' + c.strokes + ' nét · Bộ <b class="zh">' + esc(radicalOf(c.radical)) + '</b> · #' + c.order + '</span></div>' +
        '<div class="l2">' + wordList(c) + '</div>' +
        '<div class="l3">' + order + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="row">' + trace + '</div>' +
    '<div class="row">' + blank + '</div>' +
  '</section>';
}

/* ---------- Trang ---------- */
let pageNo = 0;
const TITLE = 'Vở luyện viết chữ Hán · HSK ' + LEVEL;
function page(body, cls = '') {
  pageNo++;
  return '<div class="page ' + cls + '">' +
    (cls === 'cover' ? '' : '<header><span>' + esc(TITLE) + '</span><span class="brand"><span class="logo">学</span>Voc-Lang</span></header>') +
    '<main>' + body + '</main>' +
    (cls === 'cover' ? '' : '<footer>' + pageNo + '</footer>') +
  '</div>';
}

const cover = page(
  '<div class="cv-top"><span class="logo big">学</span><span class="cv-brand">Voc-Lang</span></div>' +
  '<div class="cv-grid"><span class="mi huge">' + glyph('学') + '</span></div>' +
  '<h1>Vở luyện viết chữ Hán</h1>' +
  '<div class="cv-level">HSK ' + LEVEL + '</div>' +
  '<p class="cv-sub">' + totalInLevel + ' chữ · Thứ tự nét · Pinyin · Âm Hán-Việt · Từ vựng HSK</p>' +
  '<div class="cv-name">Họ tên: <span></span></div>', 'cover');

const rules = [
  ['十', 'Ngang trước, sổ sau'], ['人', 'Phẩy trước, mác sau'], ['三', 'Trên trước, dưới sau'], ['川', 'Trái trước, phải sau'],
  ['月', 'Ngoài trước, trong sau'], ['国', 'Vào nhà trước, đóng cửa sau'], ['小', 'Giữa trước, hai bên sau'], ['水', 'Nét móc, nét gập viết liền một nét']
];
const sample = chars[0];
const guide = page(
  '<h2>Cách dùng vở</h2>' +
  '<ol class="steps">' +
    '<li><b>Nhìn chữ mẫu</b> ở ô lớn bên trái, đọc to pinyin và âm Hán-Việt.</li>' +
    '<li><b>Viết theo thứ tự nét</b> ở dãy ô nhỏ: nét <span class="hi-txt">màu đỏ</span> là nét cần viết ở bước đó.</li>' +
    '<li><b>Tô chữ mờ</b> ở hàng thứ nhất, đặt bút đúng điểm bắt đầu của từng nét.</li>' +
    '<li><b>Tự viết</b> ở hàng ô trống, nhìn chữ mẫu càng ít càng tốt.</li>' +
    '<li>Ôn lại chữ trên ứng dụng <b>Voc-Lang</b>: phần “Vở tập viết” chấm từng nét cho bạn.</li>' +
  '</ol>' +
  '<h3>Ví dụ một khối chữ</h3>' +
  '<div class="demo">' + block(sample) + '</div>' +
  '<h3>8 quy tắc thứ tự nét cơ bản</h3>' +
  '<div class="rules">' + rules.map(([ch, t]) => {
    const n = (strokes.get(ch) || []).length;
    return '<div class="rule"><div class="rule-seq">' + Array.from({ length: n }, (_, i) => '<span class="so">' + glyph(ch, { upto: i + 1, hi: i, rest: '#E5E7EB' }) + '</span>').join('') + '</div><div class="rule-t">' + esc(t) + '</div></div>';
  }).join('') + '</div>' +
  '<p class="tip">Ô điền mễ (米字格) có đường kẻ ngang, dọc và hai đường chéo giúp đặt nét cân đối. Nên dùng bút chì hoặc bút mực 0.5 mm, in trang trên khổ A4.</p>');

const pages = [];
for (let i = 0; i < chars.length; i += PER_PAGE) pages.push(page(chars.slice(i, i + PER_PAGE).map(block).join('')));

const credits = page(
  '<h2>Nguồn dữ liệu và bản quyền</h2>' +
  '<p>Vở luyện viết do <b>Voc-Lang</b> biên soạn cho người Việt học tiếng Trung. Tài liệu dành cho người mua sử dụng cá nhân, vui lòng không chia sẻ lại.</p>' +
  '<ul class="credits">' +
    '<li>Hình nét và thứ tự nét: <b>Make Me a Hanzi</b> (github.com/skishore/makemeahanzi), phân phối theo Arphic Public License.</li>' +
    '<li>Âm Hán-Việt: Voc-Lang biên soạn, đối chiếu với cơ sở dữ liệu <b>Unicode Unihan</b>.</li>' +
    '<li>Từ vựng, pinyin và nghĩa tiếng Việt: Voc-Lang.</li>' +
  '</ul>' +
  '<p class="tip">Học miễn phí với thẻ học, phát âm và vở tập viết có chấm nét tại Voc-Lang.</p>', 'last');

/* ---------- HTML ---------- */
const MI = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
  '<g stroke="#F2B8B5" stroke-width="0.6" stroke-dasharray="3 3" fill="none">' +
  '<line x1="0" y1="50" x2="100" y2="50"/><line x1="50" y1="0" x2="50" y2="100"/>' +
  '<line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/></g></svg>');

const css = `
@page { size: A4; margin: 0; }
:root { --hi: #E11D48; --ink: #1F2937; --muted: #6B7280; --jade: #0F766E; --line: #E9A0A0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #e5e7eb; }
body { font-family: "Be Vietnam Pro", "Segoe UI", sans-serif; color: var(--ink); }
.zh { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; font-weight: 500; }
.page { width: 210mm; height: 297mm; padding: 9mm 11mm 8mm; margin: 0 auto 8mm; background: #fff; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
@media print { html, body { background: #fff; } .page { margin: 0; } }
header { flex: none; height: 7mm; display: flex; align-items: center; justify-content: space-between; border-bottom: 0.3mm solid #E5E7EB; font-size: 8.5pt; color: var(--muted); }
.brand { display: inline-flex; align-items: center; gap: 1.5mm; font-weight: 700; color: var(--jade); }
.logo { display: inline-grid; place-items: center; width: 4.6mm; height: 4.6mm; border-radius: 1.2mm; background: var(--jade); color: #fff; font: 600 7pt "Noto Sans SC", sans-serif; }
main { flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-top: 2.5mm; }
footer { flex: none; height: 5mm; text-align: center; font-size: 8pt; color: var(--muted); padding-top: 1.5mm; }
.g { display: block; width: 100%; height: 100%; }

.mi { position: relative; display: inline-block; width: 17mm; height: 17mm; border: 0.3mm solid var(--line); background: url("${MI}") center / 100% 100% no-repeat; padding: 1.2mm; }
.blk { display: flex; flex-direction: column; gap: 0; }
.info { display: flex; gap: 2.5mm; height: 16.5mm; margin-bottom: 1.5mm; }
.mi.model { width: 16.5mm; height: 16.5mm; flex: none; }
.meta { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
.l1 { display: flex; align-items: baseline; gap: 3mm; white-space: nowrap; }
.py { font-size: 12pt; font-weight: 700; }
.hv { font-size: 10.5pt; font-weight: 700; color: var(--jade); letter-spacing: .02em; }
.facts { margin-left: auto; font-size: 8pt; color: var(--muted); }
.l2 { font-size: 7.6pt; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.w + .w::before { content: "·"; margin: 0 1.6mm; color: #9CA3AF; }
.w i { font-style: normal; color: var(--muted); }
.l3 { display: flex; gap: 0.6mm; height: 5.6mm; }
.so { width: 5.6mm; height: 5.6mm; flex: none; border: 0.2mm solid #F3D3D1; padding: 0.3mm; }
.row { display: flex; }
.row .mi + .mi { border-left: 0; }
.row + .row .mi { border-top: 0; }

.cover main { justify-content: center; align-items: center; text-align: center; gap: 6mm; }
.cv-top { display: flex; align-items: center; gap: 3mm; }
.logo.big { width: 11mm; height: 11mm; border-radius: 3mm; font-size: 17pt; }
.cv-brand { font-size: 20pt; font-weight: 800; color: var(--jade); }
.mi.huge { width: 78mm; height: 78mm; padding: 6mm; border-width: 0.6mm; }
h1 { margin: 2mm 0 0; font-size: 26pt; font-weight: 800; letter-spacing: -.01em; }
.cv-level { font-size: 40pt; font-weight: 800; color: var(--jade); line-height: 1; }
.cv-sub { margin: 0; font-size: 11pt; color: var(--muted); }
.cv-name { margin-top: 14mm; font-size: 11pt; display: flex; align-items: flex-end; gap: 2mm; }
.cv-name span { display: inline-block; width: 75mm; border-bottom: 0.3mm dotted #9CA3AF; }

h2 { margin: 2mm 0 3mm; font-size: 16pt; }
h3 { margin: 4mm 0 2mm; font-size: 11.5pt; color: var(--jade); }
.page:not(.cover) main { justify-content: flex-start; }
.page.content main, .page:not(.cover):not(.last) main:has(> .blk) { justify-content: space-between; }
.steps { margin: 0; padding-left: 5mm; font-size: 10pt; line-height: 1.6; }
.hi-txt { color: var(--hi); font-weight: 700; }
.demo { padding: 3mm; border: 0.3mm dashed #CBD5E1; border-radius: 2mm; }
.rules { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm 6mm; }
.rule { display: flex; align-items: center; gap: 2.5mm; }
.rule-seq { display: flex; gap: 0.6mm; flex: none; }
.rule-seq .so { width: 7mm; height: 7mm; }
.rule-t { font-size: 9pt; }
.tip { margin-top: 4mm; font-size: 8.5pt; color: var(--muted); line-height: 1.5; }
.credits { font-size: 10pt; line-height: 1.7; padding-left: 5mm; }
`;

const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>' + esc(TITLE) + ' · Voc-Lang</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800&family=Noto+Sans+SC:wght@500;700&display=block">' +
  '<style>' + css + '</style></head><body>' + (opt('only') === 'content' ? pages.join('') : cover + guide + pages.join('') + credits) + '</body></html>';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('HTML:', OUT, '| chữ:', chars.length, '| trang:', pageNo);

/* ---------- Xuất PDF / ảnh xem trước bằng Chrome ---------- */
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const url = 'file:///' + OUT.replace(/\\/g, '/');
const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=15000', '--run-all-compositor-stages-before-draw'];
if (opt('pdf')) {
  const pdf = OUT.replace(/\.html$/, '.pdf');
  execFileSync(CHROME, common.concat(['--no-pdf-header-footer', '--print-to-pdf=' + pdf, url]), { stdio: 'ignore' });
  console.log('PDF:', pdf, Math.round(fs.statSync(pdf).size / 1024) + ' KB');
}
if (opt('png')) {
  const png = OUT.replace(/\.html$/, '.png');
  // 3 trang đầu (bìa, hướng dẫn, trang chữ đầu tiên) ở 96 dpi: 794 × 1123 px mỗi trang + khoảng cách
  const zoom = opt('zoom');   // --zoom: ảnh cận cảnh phần trên trang đầu ở độ phân giải gấp 3
  execFileSync(CHROME, common.concat(zoom ? ['--window-size=840,330', '--force-device-scale-factor=3'] : ['--window-size=840,3560'])
    .concat(['--screenshot=' + png, url]), { stdio: 'ignore' });
  console.log('PNG:', png);
}
