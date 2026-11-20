/*
 * Bước 3.6 — PDF "Danh sách từ theo bài" đi kèm bộ audio: mỗi bài một mục, đúng thứ tự từ trong file MP3.
 *
 *   node tools/tai-lieu/build-word-list.js [--level N] [--lessons N] [--pdf] [--png] [--root thư-mục]
 *
 * Đọc du-lieu/bai-audio.json (do build-audio.js ghi). Ra danh-sach-tu/Danh-sach-tu-theo-bai-HSK1-6.html (+ .pdf / .png).
 * Trang được chia trong trình duyệt: đổ lần lượt từng dòng vào trang A4, tràn thì sang trang mới
 * (bài bị tách được nhắc lại tiêu đề "tiếp"), mỗi bài bắt đầu ở trang mới.
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const ROOT = path.resolve(opt('root') || 'D:/private/voc-lang-tai-lieu');
let lessons = JSON.parse(fs.readFileSync(path.join(ROOT, 'du-lieu/bai-audio.json'), 'utf8'));
const full = !opt('level') && !opt('lessons');
if (opt('level')) lessons = lessons.filter(l => l.level === +opt('level'));
if (opt('lessons')) lessons = lessons.slice(0, +opt('lessons'));
const OUT = path.join(ROOT, full ? 'danh-sach-tu/Danh-sach-tu-theo-bai-HSK1-6.html' : '_tam/danh-sach-tu-mau.html');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const levels = [...new Set(lessons.map(l => l.level))];
const words = lessons.reduce((n, l) => n + l.words.length, 0);
const TITLE = 'Danh sách từ theo bài · Audio HSK ' + (levels.length > 1 ? levels[0] + '–' + levels[levels.length - 1] : levels[0]);

/* ---------- Trang mở đầu ---------- */
const cover =
  '<div class="page cover"><main>' +
  '<div class="cv-top"><span class="logo big">学</span><span class="cv-brand">Voc-Lang</span></div>' +
  '<div class="cv-icon">🎧</div>' +
  '<h1>Danh sách từ theo bài</h1>' +
  '<div class="cv-level">Audio HSK ' + (levels.length > 1 ? levels[0] + '–' + levels[levels.length - 1] : levels[0]) + '</div>' +
  '<p class="cv-sub">' + lessons.length + ' bài · ' + words.toLocaleString('vi-VN') + ' từ · Pinyin · Nghĩa tiếng Việt · Câu ví dụ</p>' +
  '</main></div>';

const guide =
  '<div class="page"><main>' +
  '<h2>Cách dùng bộ audio</h2>' +
  '<p>Mỗi file MP3 là một bài 25 từ, đặt tên theo cấp và số bài, ví dụ <b>HSK1-01.mp3</b> là bài 1 của HSK 1. ' +
  'Danh sách này ghi đúng thứ tự từ trong từng file để bạn nhìn theo khi nghe.</p>' +
  '<h3>Trong mỗi bài, từng từ được đọc theo thứ tự</h3>' +
  '<div class="flow">' +
    '<span class="fl zh">安排 · 安排</span><i>→</i><span class="fl">sắp xếp, bố trí</span><i>→</i>' +
    '<span class="fl zh">我来安排时间。</span><i>→</i><span class="fl">Để tôi sắp xếp thời gian.</span>' +
  '</div>' +
  '<p class="muted">Từ tiếng Trung đọc chậm hai lần, sau đó là nghĩa tiếng Việt, một câu ví dụ và nghĩa của câu. Cuối mỗi từ có khoảng nghỉ để bạn nhắc lại.</p>' +
  '<h3>Gợi ý luyện nghe</h3>' +
  '<ol class="steps">' +
    '<li><b>Lần 1 — nhìn và nghe:</b> mở trang của bài, nghe và dò theo từng dòng.</li>' +
    '<li><b>Lần 2 — nhắc lại:</b> đọc to theo trong khoảng nghỉ sau mỗi từ.</li>' +
    '<li><b>Lần 3 — nghe thụ động:</b> nghe khi đi đường, nấu ăn… không cần nhìn.</li>' +
    '<li><b>Tự kiểm tra:</b> che cột nghĩa, nhìn chữ Hán và đọc nghĩa; ôn lại các từ chưa nhớ trên ứng dụng Voc-Lang.</li>' +
  '</ol>' +
  '</main></div>' +
  '<div class="page"><main><h2>Mục lục</h2><p class="muted">Số lớn là số bài, số nhỏ là khoảng từ trong bài. Bấm vào ô để tới bài đó (khi xem trên máy).</p>' +
  levels.map(lv => {
    const ls = lessons.filter(l => l.level === lv);
    return '<div class="toc"><div class="toc-h">HSK ' + lv + ' <span>' + ls.length + ' bài · ' + ls.reduce((n, l) => n + l.words.length, 0) + ' từ</span></div>' +
      '<div class="toc-list">' + ls.map(l => '<a href="#' + l.id + '"><b>' + l.no + '</b><span>' + l.from + '–' + l.to + '</span></a>').join('') + '</div></div>';
  }).join('') +
  '</main></div>';

const credits =
  '<div class="page last"><main>' +
  '<h2>Nguồn và bản quyền</h2>' +
  '<p>Bộ audio và danh sách từ do <b>Voc-Lang</b> biên soạn cho người Việt học tiếng Trung. Tài liệu dành cho người mua sử dụng cá nhân, vui lòng không chia sẻ lại.</p>' +
  '<ul class="credits">' +
    '<li>Từ vựng, pinyin, nghĩa tiếng Việt và câu ví dụ: Voc-Lang.</li>' +
    '<li>Giọng đọc: Microsoft Azure AI Speech (giọng tiếng Trung Xiaoxiao, giọng tiếng Việt HoaiMy).</li>' +
  '</ul>' +
  '<p class="muted">Học miễn phí với thẻ học, phát âm và vở tập viết có chấm nét tại Voc-Lang.</p>' +
  '</main></div>';

/* ---------- Dòng nội dung (chia trang ở trình duyệt) ---------- */
function lessonHead(l, cont) {
  return '<div class="lh' + (cont ? ' cont' : '') + '"' + (cont ? '' : ' id="' + l.id + '"') + '>' +
    '<span class="lh-badge">HSK ' + l.level + '</span>' +
    '<span class="lh-title">Bài ' + l.no + (cont ? ' <i>(tiếp)</i>' : '') + '</span>' +
    '<span class="lh-range">Từ ' + l.from + '–' + l.to + '</span>' +
    '<span class="lh-file">🎧 ' + l.id + '.mp3</span></div>';
}
const rows = lessons.map(l =>
  '<section class="lesson" data-head="' + esc(lessonHead(l, true)) + '">' + lessonHead(l, false) +
  l.words.map(w =>
    '<div class="r">' +
      '<span class="no">' + w.no + '</span>' +
      '<span class="wd"><span class="zh hz">' + esc(w.hanzi) + '</span><span class="py">' + esc(w.pinyin) + '</span></span>' +
      '<span class="vi">' + esc(w.vi) + '</span>' +
      '<span class="ex"><span class="ex1"><span class="zh">' + esc(w.exZh) + '</span> <span class="expy">' + esc(w.exPinyin) + '</span></span><span class="exvi">' + esc(w.exVi) + '</span></span>' +
    '</div>').join('') +
  '</section>').join('');

/* Đổ dòng vào trang A4; chạy trước khi in */
const paginate = `
(function () {
  var src = document.getElementById('src'), out = document.getElementById('out'), n = document.querySelectorAll('.page').length;
  function newPage() {
    var p = document.createElement('div'); p.className = 'page content';
    p.innerHTML = '<header><span>${esc(TITLE)}</span><span class="brand"><span class="logo">学</span>Voc-Lang</span></header><main></main><footer></footer>';
    out.appendChild(p); return p.querySelector('main');
  }
  var lessons = Array.prototype.slice.call(src.querySelectorAll('.lesson'));
  var over = function (m) { return m.scrollHeight > m.clientHeight + 1; };
  lessons.forEach(function (sec) {
    var main = newPage(), items = Array.prototype.slice.call(sec.children);
    // Thử để cả bài trong một trang (nếu cần thì thu chữ nhỏ lại một chút); vẫn tràn thì chia dòng sang trang sau
    items.forEach(function (it) { main.appendChild(it); });
    if (!over(main)) return;
    main.parentNode.classList.add('tight');
    if (!over(main)) return;
    main.parentNode.classList.remove('tight');
    items.forEach(function (it) { sec.appendChild(it); });
    items.forEach(function (it) {
      main.appendChild(it);
      if (main.scrollHeight > main.clientHeight + 1 && main.children.length > 1) {
        main = newPage();
        var t = document.createElement('div'); t.innerHTML = sec.getAttribute('data-head');
        main.appendChild(t.firstChild); main.appendChild(it);
      }
    });
  });
  src.remove();
  var pages = document.querySelectorAll('.page');
  pages.forEach(function (p, i) { var f = p.querySelector('footer'); if (f) f.textContent = i + 1; });
  document.title = document.title + ' (' + pages.length + ' trang)';
  window.__pages = pages.length;
})();`;

const css = `
@page { size: A4; margin: 0; }
.tight .r { padding: 0.25mm 0; }
.tight .hz { font-size: 10.5pt; } .tight .vi { font-size: 7.9pt; } .tight .ex1 .zh { font-size: 8.8pt; }
.tight .expy { font-size: 6.8pt; } .tight .exvi { font-size: 7.6pt; }
:root { --ink: #1F2937; --muted: #6B7280; --jade: #0F766E; --jade-50: #ECFDF5; --line: #E5E7EB; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #e5e7eb; }
body { font-family: "Be Vietnam Pro", "Segoe UI", sans-serif; color: var(--ink); }
.zh { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; font-weight: 500; }
.page { width: 210mm; height: 297mm; padding: 8mm 11mm 6mm; margin: 0 auto 8mm; background: #fff; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
@media print { html, body { background: #fff; } .page { margin: 0; } }
header { flex: none; height: 7mm; display: flex; align-items: center; justify-content: space-between; border-bottom: 0.3mm solid var(--line); font-size: 8.5pt; color: var(--muted); }
.brand { display: inline-flex; align-items: center; gap: 1.5mm; font-weight: 700; color: var(--jade); }
.logo { display: inline-grid; place-items: center; width: 4.6mm; height: 4.6mm; border-radius: 1.2mm; background: var(--jade); color: #fff; font: 600 7pt "Noto Sans SC", sans-serif; }
main { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-top: 2.5mm; overflow: hidden; }
footer { flex: none; height: 5mm; text-align: center; font-size: 8pt; color: var(--muted); padding-top: 1.5mm; }

.cover main { justify-content: center; align-items: center; text-align: center; gap: 6mm; }
.cv-top { display: flex; align-items: center; gap: 3mm; }
.logo.big { width: 11mm; height: 11mm; border-radius: 3mm; font-size: 17pt; }
.cv-brand { font-size: 20pt; font-weight: 800; color: var(--jade); }
.cv-icon { font-size: 64pt; line-height: 1; margin: 8mm 0 2mm; }
h1 { margin: 0; font-size: 26pt; font-weight: 800; }
.cv-level { font-size: 34pt; font-weight: 800; color: var(--jade); line-height: 1; }
.cv-sub { margin: 0; font-size: 11pt; color: var(--muted); }

h2 { margin: 1mm 0 3mm; font-size: 16pt; }
h3 { margin: 5mm 0 2mm; font-size: 11.5pt; color: var(--jade); }
p { margin: 0 0 2mm; font-size: 10pt; line-height: 1.55; }
.muted { color: var(--muted); font-size: 9pt; }
.steps { margin: 0; padding-left: 5mm; font-size: 10pt; line-height: 1.6; }
.credits { font-size: 10pt; line-height: 1.7; padding-left: 5mm; }
.flow { display: flex; flex-wrap: wrap; align-items: center; gap: 1.5mm 2mm; margin: 1mm 0 2mm; }
.fl { padding: 1.2mm 2.5mm; border-radius: 1.5mm; background: var(--jade-50); font-size: 9.5pt; }
.flow i { font-style: normal; color: var(--muted); }
.toc { margin-bottom: 2.2mm; }
.toc-h { font-size: 9.5pt; font-weight: 700; margin-bottom: 1mm; }
.toc-h span { font-weight: 400; color: var(--muted); margin-left: 1.5mm; }
.toc-list { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0.8mm; }
.toc-list a { display: flex; flex-direction: column; align-items: center; padding: 0.5mm 0; border: 0.2mm solid var(--line); border-radius: 1mm; text-decoration: none; color: var(--ink); }
.toc-list b { font-size: 8pt; }
.toc-list span { font-size: 6pt; color: var(--muted); }

.lh { display: flex; align-items: center; gap: 2.5mm; padding: 0 0 1.5mm; margin-bottom: 0.5mm; border-bottom: 0.5mm solid var(--jade); }
.lh-badge { padding: 0.6mm 2mm; border-radius: 1mm; background: var(--jade); color: #fff; font-size: 8.5pt; font-weight: 700; }
.lh-title { font-size: 13pt; font-weight: 800; }
.lh-title i { font-size: 9pt; font-weight: 500; color: var(--muted); }
.lh-range { font-size: 9pt; color: var(--muted); }
.lh-file { margin-left: auto; font-size: 8.5pt; color: var(--jade); font-weight: 600; }
.r { display: grid; grid-template-columns: 6mm 24mm 38mm 1fr; gap: 2.2mm; padding: 0.55mm 0; border-bottom: 0.2mm solid var(--line); break-inside: avoid; }
.no { font-size: 7.5pt; color: var(--muted); padding-top: 0.9mm; text-align: right; }
.wd { display: flex; flex-direction: column; }
.hz { font-size: 11pt; line-height: 1.1; }
.py { font-size: 7pt; line-height: 1.15; color: var(--jade); font-weight: 600; }
.vi { font-size: 8.3pt; line-height: 1.22; padding-top: 0.5mm; }
.ex { display: flex; flex-direction: column; line-height: 1.22; padding-top: 0.3mm; }
.ex1 .zh { font-size: 9.2pt; }
.expy { font-size: 7.2pt; color: var(--muted); }
.exvi { font-size: 8pt; color: #374151; font-style: italic; }
`;

const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>' + esc(TITLE) + ' · Voc-Lang</title>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@500;700&display=block">' +
  '<style>' + css + '</style></head><body>' + cover + guide +
  '<div id="out"></div><div id="src" class="page content" style="height:auto;position:absolute;left:-9999px">' + rows + '</div>' + credits +
  '<script>document.fonts.ready.then(function () {' + paginate + '; document.getElementById("out").parentNode.appendChild(document.querySelector(".page.last")); });</script>' +
  '</body></html>';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('HTML:', OUT, '| bài:', lessons.length, '| từ:', words);

/* ---------- Xuất PDF / ảnh xem trước bằng Chrome ---------- */
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const url = 'file:///' + OUT.replace(/\\/g, '/');
const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=30000', '--run-all-compositor-stages-before-draw'];
if (opt('pdf')) {
  const pdf = OUT.replace(/\.html$/, '.pdf');
  execFileSync(CHROME, common.concat(['--no-pdf-header-footer', '--print-to-pdf=' + pdf, url]), { stdio: 'ignore' });
  const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('PDF:', pdf, Math.round(fs.statSync(pdf).size / 1024) + ' KB,', pages, 'trang');
}
if (opt('png')) {
  const png = OUT.replace(/\.html$/, '.png');
  // bìa, hướng dẫn, mục lục + 2 trang nội dung đầu: mỗi trang 1123 px + 30 px khoảng cách
  execFileSync(CHROME, common.concat(['--window-size=840,' + (1153 * 5), '--screenshot=' + png, url]), { stdio: 'ignore' });
  console.log('PNG:', png);
}
