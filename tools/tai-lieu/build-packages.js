/*
 * Giai đoạn 5.1 — Dựng 3 thư mục gói bán, mỗi gói kèm "00-Doc-truoc.pdf" (trong gói có gì, cách in, cách nghe, hỗ trợ).
 *
 *   node tools/tai-lieu/build-packages.js            dựng lại cả 3 thư mục trong <tài-liệu>/goi/
 *   node tools/tai-lieu/build-packages.js --png      thêm ảnh xem trước của 3 file Đọc trước (_tam/doc-truoc-goi-N.png)
 *
 * File lớn (MP3, PDF) được nối bằng hard link (cùng ổ đĩa, không tốn thêm dung lượng); không được thì chép.
 * Tên thư mục / file không dấu để giải nén trên mọi máy không lỗi phông.
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const ROOT = path.resolve((args[args.indexOf('--root') + 1] && args.includes('--root')) ? args[args.indexOf('--root') + 1] : 'D:/private/voc-lang-tai-lieu');
const OUT = path.join(ROOT, 'goi'), TAM = path.join(ROOT, '_tam');
const APP_URL = 'https://voclanghsk.com/';

/* ---------- Số liệu thật từ file đã tạo ---------- */
const pagesOf = f => (fs.readFileSync(f, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const lessons = require(path.join(ROOT, 'du-lieu/bai-audio.json'));
const audioFile = l => path.join(ROOT, 'audio', 'HSK' + l.level, l.id + '.mp3');
const audioBytes = lessons.reduce((t, l) => t + fs.statSync(audioFile(l)).size, 0);
const audioHours = audioBytes * 8 / 96000 / 3600;
const wordCount = lessons.reduce((t, l) => t + l.words.length, 0);
const chars = require(path.join(ROOT, 'du-lieu/chu-han.json'));
const charsOf = lv => chars.filter(c => c.level === lv).length;
const WB = lv => path.join(ROOT, 'vo-luyen-viet', 'Vo-luyen-viet-HSK' + lv + '.pdf');
const WORDLIST = path.join(ROOT, 'danh-sach-tu', 'Danh-sach-tu-theo-bai-HSK1-6.pdf');
const RADICAL = path.join(ROOT, 'so-tay-bo-thu', 'So-tay-214-bo-thu.pdf');
const fmt = n => n.toLocaleString('vi-VN');

/* ---------- Nội dung 3 gói ---------- */
const wbItems = lvs => lvs.map(lv => ({ src: WB(lv), name: 'Vo-luyen-viet-HSK' + lv + '.pdf', what: 'Vở luyện viết HSK ' + lv, detail: fmt(charsOf(lv)) + ' chữ · ' + pagesOf(WB(lv)) + ' trang A4' }));
const audioItems = dir => lessons.map(l => ({ src: audioFile(l), name: path.join(dir, 'HSK' + l.level, l.id + '.mp3') }));
const PACKAGES = [
  {
    no: 1, folder: 'Goi-1-Vo-luyen-viet-HSK1-3', title: 'Vở luyện viết chữ Hán HSK 1–3',
    files: wbItems([1, 2, 3]), sections: ['print']
  },
  {
    no: 2, folder: 'Goi-2-Audio-HSK1-6', title: 'Audio nghe song ngữ HSK 1–6',
    files: [{ src: WORDLIST, name: 'Danh-sach-tu-theo-bai-HSK1-6.pdf', what: 'Danh sách từ theo bài', detail: pagesOf(WORDLIST) + ' trang · nhìn theo khi nghe' }]
      .concat([{ dir: 'Audio', what: 'Audio HSK 1–6 (thư mục Audio/HSK1 … HSK6)', detail: lessons.length + ' bài MP3 · ' + fmt(wordCount) + ' từ · ~' + audioHours.toFixed(1).replace('.', ',') + ' giờ' }])
      .concat(audioItems('Audio')),
    sections: ['listen']
  },
  {
    no: 3, folder: 'Goi-3-Combo-HSK1-6', title: 'Trọn bộ HSK 1–6 và 214 bộ thủ',
    files: [{ dir: '1-Vo-luyen-viet', what: 'Vở luyện viết HSK 1–6 (6 file PDF, mỗi cấp một file)', detail: fmt(chars.length) + ' chữ · ' + [1, 2, 3, 4, 5, 6].reduce((t, lv) => t + pagesOf(WB(lv)), 0) + ' trang A4' }]
      .concat(wbItems([1, 2, 3, 4, 5, 6]).map(f => ({ src: f.src, name: path.join('1-Vo-luyen-viet', f.name) })))
      .concat([{ dir: '2-Audio', what: 'Audio HSK 1–6 (thư mục 2-Audio/HSK1 … HSK6)', detail: lessons.length + ' bài MP3 · ' + fmt(wordCount) + ' từ · ~' + audioHours.toFixed(1).replace('.', ',') + ' giờ' }])
      .concat(audioItems('2-Audio'))
      .concat([{ src: WORDLIST, name: path.join('2-Audio', 'Danh-sach-tu-theo-bai-HSK1-6.pdf'), what: 'Danh sách từ theo bài', detail: pagesOf(WORDLIST) + ' trang · nhìn theo khi nghe' }])
      .concat([{ src: RADICAL, name: '3-So-tay-214-bo-thu.pdf', what: 'Sổ tay 214 bộ thủ', detail: pagesOf(RADICAL) + ' trang · chiết tự, thứ tự nét, ví dụ' }]),
    sections: ['print', 'listen', 'radical']
  }
];

/* ---------- Trang "Đọc trước" ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SECTIONS = {
  print: `<h2>Cách in và dùng vở luyện viết</h2>
<ul>
<li>In khổ <b>A4</b>, chọn tỉ lệ <b>100% / Kích thước thực</b>. Đừng chọn "Vừa trang" (Fit), vì ô chữ sẽ bị thu nhỏ.</li>
<li>Không cần in cả cuốn: in vài trang mỗi tuần, trang nào cần luyện thêm thì in lại.</li>
<li>Mỗi trang có 5 chữ. Mỗi chữ có pinyin, âm Hán-Việt, từ HSK chứa chữ đó, thứ tự từng nét và 2 hàng ô luyện:
hàng trên tô theo chữ mờ, hàng dưới tự viết.</li>
<li>Đọc trang 2 của vở trước khi bắt đầu (cách đọc một khối chữ, 8 quy tắc thứ tự nét). Mỗi ngày luyện 1–2 trang là đủ.</li>
</ul>`,
  listen: `<h2>Cách nghe audio</h2>
<ul>
<li>Mỗi bài có 25 từ, dài khoảng 5–6 phút. Bài cuối của mỗi cấp có thể ít từ hơn. Tên file theo cấp và số bài, ví dụ <b>HSK1-01.mp3</b>.</li>
<li>Với mỗi từ, bạn nghe: <b>từ tiếng Trung đọc 2 lần → nghĩa tiếng Việt → một câu ví dụ tiếng Trung → nghĩa của câu</b>.</li>
<li>Mở file <b>Danh sách từ theo bài</b> để nhìn chữ, pinyin và câu ví dụ trong lúc nghe. Mỗi bài nằm gọn trên một trang.</li>
<li>Gợi ý: mỗi ngày nghe 1 bài mới và nghe lại 1–2 bài cũ, lúc đi đường hoặc khi làm việc nhà.</li>
<li>Thứ tự từ trong các bài khớp với thứ tự từ trong ứng dụng Voc-Lang, nên bạn có thể nghe bài rồi ôn lại bằng thẻ học trong ứng dụng.</li>
</ul>`,
  radical: `<h2>Sổ tay 214 bộ thủ</h2>
<ul>
<li>Đọc 2 trang hướng dẫn ở đầu sổ: bộ thủ là gì, dạng giản thể và cách tra chữ theo bộ.</li>
<li>Không cần học cả 214 bộ một lúc. Bắt đầu với 24 bộ hay gặp nhất (có danh sách trong sổ), mỗi ngày 2–3 bộ.</li>
<li>Mỗi bộ có câu chiết tự để nhớ nhanh, thứ tự nét, chữ HSK ví dụ và hàng ô luyện viết. Sổ in A4 tỉ lệ 100% như vở luyện viết.</li>
</ul>`
};
function docHtml(p) {
  const list = p.files.filter(f => f.what).map(f => `<tr><td class="f">${esc(f.dir ? f.dir + '/' : f.name.replace(/\\/g, '/'))}</td><td><b>${esc(f.what)}</b><br><span class="muted">${esc(f.detail)}</span></td></tr>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Đọc trước — Gói ${p.no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@500;700&display=block">
<style>
@page { size: A4; margin: 0; }
:root { --ink: #1F2937; --muted: #6B7280; --jade: #0F766E; --jade-50: #ECFDF5; --line: #E5E7EB; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font-family: "Be Vietnam Pro", "Segoe UI", sans-serif; color: var(--ink); font-size: 9.3pt; line-height: 1.4; }
.page { width: 210mm; min-height: 297mm; padding: 11mm 16mm 4mm; }
.top { display: flex; align-items: center; gap: 2.5mm; color: var(--jade); font-weight: 700; font-size: 12pt; }
.logo { display: inline-grid; place-items: center; width: 8mm; height: 8mm; border-radius: 2mm; background: var(--jade); color: #fff; font: 700 12pt "Noto Sans SC", sans-serif; }
h1 { font-size: 18pt; margin: 4mm 0 1mm; line-height: 1.25; }
.sub { color: var(--muted); margin: 0 0 3mm; }
h2 { font-size: 12pt; color: var(--jade); margin: 4.5mm 0 1.5mm; padding-bottom: 0.8mm; border-bottom: 0.3mm solid var(--line); }
table { width: 100%; border-collapse: collapse; }
td { padding: 1.3mm 2mm; border-bottom: 0.3mm solid var(--line); vertical-align: top; }
td.f { width: 44%; font-family: Consolas, "Courier New", monospace; font-size: 8pt; color: var(--muted); white-space: nowrap; }
ul { margin: 0; padding-left: 5mm; } li { margin: 0.5mm 0; }
.muted { color: var(--muted); font-size: 9pt; }
.box { background: var(--jade-50); border-radius: 2mm; padding: 3mm 4mm; margin-top: 3mm; }
a { color: var(--jade); }
.foot { margin-top: 4mm; font-size: 8.5pt; color: var(--muted); }
</style></head><body><div class="page">
<div class="top"><span class="logo">学</span>Voc-Lang</div>
<h1>Gói ${p.no}: ${esc(p.title)}</h1>
<p class="sub">Cảm ơn bạn đã ủng hộ Voc-Lang! Trang này giới thiệu nội dung gói và cách dùng hiệu quả nhất.</p>
<h2>Trong gói có gì</h2>
<table>${list}</table>
${p.sections.map(s => SECTIONS[s]).join('\n')}
<h2>Học cùng ứng dụng Voc-Lang</h2>
<p>Ứng dụng miễn phí: <a href="${APP_URL}">${APP_URL}</a>. Có thẻ học từ vựng HSK 1–9, ôn tập theo lịch, luyện viết từng nét trên màn hình.
Đăng nhập Google để lưu tiến độ trên nhiều thiết bị.</p>
<div class="box"><b>Lưu file ngay sau khi tải.</b> Link tải trong email chỉ dùng được trong 24 giờ.
Nếu cần hỗ trợ (tải lỗi, thiếu file, cần link mới) thì bạn <b>trả lời email đã nhận link</b>, mình sẽ phản hồi sớm.</div>
<p class="foot">Tài liệu dành cho người mua dùng cho việc học của mình. Vui lòng không chia sẻ lại, không đăng tải công khai và không bán lại.
Nguồn dữ liệu và bản quyền phông, nét chữ được ghi ở trang cuối mỗi file PDF.</p>
</div></body></html>`;
}

/* ---------- Chrome ---------- */
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=20000', '--run-all-compositor-stages-before-draw'];

/* ---------- Dựng thư mục ---------- */
fs.mkdirSync(TAM, { recursive: true });
for (const p of PACKAGES) {
  const dir = path.join(OUT, p.folder);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let linked = 0, copied = 0, bytes = 0;
  for (const f of p.files.filter(f => f.src)) {
    const dst = path.join(dir, f.name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try { fs.linkSync(f.src, dst); linked++; } catch { fs.copyFileSync(f.src, dst); copied++; }
    bytes += fs.statSync(dst).size;
  }
  const html = path.join(TAM, 'doc-truoc-goi-' + p.no + '.html');
  fs.writeFileSync(html, docHtml(p));
  const url = 'file:///' + html.replace(/\\/g, '/');
  const pdf = path.join(dir, '00-Doc-truoc.pdf');
  execFileSync(CHROME, common.concat(['--no-pdf-header-footer', '--print-to-pdf=' + pdf, url]), { stdio: 'ignore' });
  if (args.includes('--png')) execFileSync(CHROME, common.concat(['--window-size=794,1123', '--screenshot=' + html.replace(/\.html$/, '.png'), url]), { stdio: 'ignore' });
  bytes += fs.statSync(pdf).size;
  console.log(`Gói ${p.no}: ${dir} | ${linked + copied + 1} file (${linked} hard link, ${copied} chép) | ${Math.round(bytes / 1048576)} MB | Đọc trước: ${pagesOf(pdf)} trang`);
}
