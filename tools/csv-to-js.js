/*
 * Chuyển dữ liệu từ vựng data/hsk1.csv … data/hsk9.csv → js/data/hsk1.js … hsk9.js + js/data/levels.js
 * (web mở trực tiếp file nên không đọc được CSV; mỗi cấp một file để web chỉ tải cấp đang học).
 *
 * Cách chạy:  node tools/csv-to-js.js     (hoặc bấm đúp cap-nhat-du-lieu.bat)
 *
 * - Chỉ đọc các file hskN.csv đang có; cấp nào chưa có file thì bỏ qua.
 * - Cột đọc theo TÊN ở dòng tiêu đề (thứ tự tùy ý). Dấu phân cách , ; hoặc Tab đều được
 *   (Excel tiếng Việt thường lưu CSV bằng dấu ;).
 * - Cấp HSK lấy theo tên file (hsk3.csv → HSK 3). HSK 7-9 nhiều từ nên chia phần:
 *   hsk7-9-part1.csv, hsk7-9-part2.csv … → js/data/hsk7-9-p1.js …, mỗi phần là một lựa chọn trên web.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'js', 'data');

const CJK = /[一-龥]/;
const REQUIRED = ['hanzi', 'pinyin', 'meaning_vi'];
const KNOWN = [
  'hanzi', 'traditional', 'pinyin', 'meaning_vi', 'hsk_level', 'tags', 'image', 'explanation',
  'basic_zh', 'basic_pinyin', 'basic_vi',
  'simple_zh', 'simple_pinyin', 'simple_vi',
  'compound_zh', 'compound_pinyin', 'compound_vi',
  'related'
];

function detectDelimiter(firstLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && c in counts) counts[c]++;
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

function parseCSV(text, delim) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

/** Đọc một file hskN.csv. seen: { hanzi: "hsk1.csv dòng 5" } dùng chung để phát hiện trùng giữa các file. */
function convertFile(file, level, seen, errors, warnings) {
  const name = path.basename(file);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const delim = detectDelimiter(text.split(/\r?\n/, 1)[0]);
  const rows = parseCSV(text, delim);
  if (rows.length < 2) { warnings.push(name + ': không có dữ liệu'); return []; }

  const header = rows.shift().map(h => h.trim().toLowerCase());
  const col = {};
  header.forEach((h, i) => { col[h] = i; });

  const missing = REQUIRED.filter(c => col[c] == null);
  if (missing.length) { errors.push(name + ': thiếu cột bắt buộc ' + missing.join(', ')); return []; }
  const unknown = header.filter(h => h && !KNOWN.includes(h));
  if (unknown.length) warnings.push(name + ': bỏ qua cột không dùng ' + unknown.join(', '));

  const items = [];
  let levelMismatch = 0;
  rows.forEach((r, idx) => {
    const where = name + ' dòng ' + (idx + 2);
    const t = c => (col[c] == null ? '' : (r[col[c]] || '')).trim().normalize('NFC');

    const hanzi = t('hanzi');
    if (!hanzi || !t('pinyin') || !t('meaning_vi')) { errors.push(where + ': thiếu hanzi / pinyin / meaning_vi'); return; }
    if (!CJK.test(hanzi)) { errors.push(where + ': "' + hanzi + '" không có chữ Hán hợp lệ'); return; }
    if (seen[hanzi]) { warnings.push(where + ': "' + hanzi + '" đã có ở ' + seen[hanzi] + ' → bỏ qua dòng này'); return; }
    seen[hanzi] = where;

    if (t('hsk_level') && t('hsk_level').replace(/\s/g, '') !== level) levelMismatch++;

    const examples = [];
    [['basic', 'basic'], ['simple', 'simple'], ['compound', 'compound']].forEach(([prefix, type]) => {
      const zh = t(prefix + '_zh');
      if (zh) examples.push({ type, zh, pinyin: t(prefix + '_pinyin'), vi: t(prefix + '_vi') });
    });
    if (!examples.length) warnings.push(where + ' (' + hanzi + '): chưa có câu ví dụ nào');

    const related = t('related').split(/[;\n]/).map(s => {
      const p = s.split('|').map(x => x.trim());
      if (!p[0]) return null;
      if (!CJK.test(p[0]) || p.length < 3) warnings.push(where + ' (' + hanzi + '): từ liên quan "' + s.trim() + '" chưa đúng dạng chữ|pinyin|nghĩa');
      return CJK.test(p[0]) ? { hanzi: p[0], pinyin: p[1] || '', vi: p[2] || '' } : null;
    }).filter(Boolean);

    const item = {
      id: hanzi,                       // id = chữ Hán → tiến độ học không mất khi đổi thứ tự dòng / chuyển file
      hanzi,
      pinyin: t('pinyin'),
      meaning_vi: t('meaning_vi'),
      explanation: t('explanation'),
      hsk_level: /^\d$/.test(level) ? +level : level,   // 3 hoặc '7-9' (để hiển thị)
      tags: t('tags') ? t('tags').split(/[;,|]/).map(x => x.trim()).filter(Boolean) : [],
      image: t('image'),
      examples,
      related
    };
    if (t('traditional') && t('traditional') !== hanzi) item.traditional = t('traditional');
    items.push(item);
  });
  if (levelMismatch) warnings.push(name + ': ' + levelMismatch + ' dòng có cột hsk_level khác ' + level + ' → dùng HSK ' + level + ' theo tên file');
  return items;
}

/** Liệt kê file dữ liệu theo thứ tự: hsk1.csv … hsk6.csv, hsk7-9.csv, hsk7-9-part1.csv, part2 … */
function listFiles() {
  const files = [];
  fs.readdirSync(DATA_DIR).forEach(name => {
    let m;
    if ((m = /^hsk([1-9])\.csv$/i.exec(name))) {
      files.push({ key: m[1], level: m[1], label: 'HSK ' + m[1], order: +m[1] * 100, name });
    } else if (/^hsk7-9\.csv$/i.test(name)) {
      files.push({ key: '7-9', level: '7-9', label: 'HSK 7-9', order: 700, name });
    } else if ((m = /^hsk7-9-part(\d+)\.csv$/i.exec(name))) {
      files.push({ key: '7-9-p' + +m[1], level: '7-9', label: 'HSK 7-9 · Phần ' + +m[1], order: 700 + +m[1], name });
    }
  });
  return files.sort((a, b) => a.order - b.order)
    .map(x => Object.assign(x, { file: path.join(DATA_DIR, x.name) }));
}

function main() {
  const files = listFiles();
  if (!files.length) { console.error('✗ Không có file nào dạng data/hsk1.csv … data/hsk6.csv, data/hsk7-9-part1.csv'); process.exit(1); }

  const seen = {}, errors = [], warnings = [], result = [];
  files.forEach(x => result.push(Object.assign({}, x, { items: convertFile(x.file, x.level, seen, errors, warnings) })));

  warnings.forEach(w => console.warn('! ' + w));
  if (errors.length) {
    errors.forEach(e => console.error('✗ ' + e));
    console.error('\n✗ Có ' + errors.length + ' lỗi — CHƯA cập nhật dữ liệu web. Sửa file CSV rồi chạy lại.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const banner = '/* TỰ ĐỘNG TẠO từ data/*.csv bởi tools/csv-to-js.js — đừng sửa tay. Sửa CSV rồi chạy cap-nhat-du-lieu.bat */\n';
  const levels = [];
  result.forEach(({ key, label, items }) => {
    if (!items.length) return;
    fs.writeFileSync(path.join(OUT_DIR, 'hsk' + key + '.js'),
      banner + 'window.HSK_DATA = window.HSK_DATA || {};\nwindow.HSK_DATA[' + JSON.stringify(key) + '] = ' + JSON.stringify(items) + ';\n', 'utf8');
    levels.push({ level: key, label, count: items.length });   // level = khóa bộ dữ liệu = tên file js/data/hsk{level}.js
  });
  // Xóa file của cấp không còn CSV
  fs.readdirSync(OUT_DIR).forEach(f => {
    const m = /^hsk(.+)\.js$/.exec(f);
    if (m && !levels.some(l => l.level === m[1])) fs.unlinkSync(path.join(OUT_DIR, f));
  });
  fs.writeFileSync(path.join(OUT_DIR, 'levels.js'), banner + 'window.HSK_LEVELS = ' + JSON.stringify(levels) + ';\n', 'utf8');

  console.log('✓ Đã cập nhật dữ liệu web:');
  levels.forEach(l => console.log('   ' + l.label + ': ' + l.count + ' từ'));
  console.log('   Tổng: ' + levels.reduce((s, l) => s + l.count, 0) + ' từ');
}

main();
