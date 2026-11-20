/*
 * Giai đoạn 3 — Audio HSK 1–6: chia bài 25 từ, dựng SSML, gọi Azure Speech, ghép MP3 theo bài.
 *
 *   node tools/tai-lieu/build-audio.js --dry-run                 thống kê bài, ký tự tính phí, thời lượng ước tính
 *   node tools/tai-lieu/build-audio.js --lesson HSK1-01          tạo 1 bài (bước 3.3)
 *   node tools/tai-lieu/build-audio.js --level 1                 tạo cả cấp
 *   node tools/tai-lieu/build-audio.js --all                     tạo hết 216 bài
 *   thêm --ssml để in SSML của từ đầu tiên trong phạm vi (không gọi Azure)
 *
 * Mỗi từ: từ tiếng Trung ×2 → nghĩa tiếng Việt → 1 câu ví dụ tiếng Trung → nghĩa câu.
 * Câu ví dụ: loại "basic" (ngắn, dễ nghe); nếu câu basic gần như chỉ là chính từ đó (你好！) thì dùng "simple".
 * Từ một chữ được ghi kèm âm pinyin (<phoneme>) để Azure không đọc nhầm chữ đa âm.
 *
 * Key: <tài-liệu>/.azure-speech.env (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) — không bao giờ in ra.
 * Mỗi từ là một request, kết quả lưu đệm ở _tam/audio-cache (chạy lại bỏ qua phần đã có, đổi nội dung thì tạo lại).
 * Gói F0: 20 request/phút, 0,5 triệu ký tự/tháng (chữ Hán tính 2) → sổ du-lieu/azure-usage.json, dừng khi chạm trần.
 * Ra: audio/HSK<n>/HSK<n>-<bb>.mp3 và du-lieu/bai-audio.json (danh sách từ theo bài, dùng cho PDF bước 3.6).
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const ROOT = path.resolve(opt('root') || 'D:/private/voc-lang-tai-lieu');
const REPO = path.resolve(__dirname, '../..');
const PER_LESSON = 25;
const VOICE_ZH = 'zh-CN-XiaoxiaoNeural', VOICE_VI = 'vi-VN-HoaiMyNeural';
const FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const MONTH_LIMIT = 480000;                  // chừa ~20k dưới trần 500k của F0
const GAP_MS = 3200;                         // ≤ 20 request/phút

/* ---------- Dữ liệu & chia bài ---------- */
global.window = {};
for (let i = 1; i <= 6; i++) require(path.join(REPO, 'js/data/hsk' + i + '.js'));
const core = s => s.replace(/[\s，。！？、“”：；…,.!?"'·]/g, '');
function pickExample(w) {
  const b = w.examples.find(e => e.type === 'basic'), s = w.examples.find(e => e.type === 'simple');
  if (!b) return s || w.examples[0];
  return s && core(b.zh).length <= w.hanzi.length + 1 ? s : b;
}
const lessons = [];
for (let lv = 1; lv <= 6; lv++) {
  const words = window.HSK_DATA[lv];
  for (let i = 0; i < words.length; i += PER_LESSON) {
    const n = i / PER_LESSON + 1;
    lessons.push({
      id: 'HSK' + lv + '-' + String(n).padStart(2, '0'), level: lv, no: n, from: i + 1,
      words: words.slice(i, i + PER_LESSON).map((w, k) => {
        const e = pickExample(w);
        return { no: i + k + 1, hanzi: w.hanzi, pinyin: w.pinyin, vi: w.meaning_vi, exZh: e.zh, exPinyin: e.pinyin, exVi: e.vi };
      })
    });
  }
}
lessons.forEach(l => { l.to = l.from + l.words.length - 1; l.total = lessons.filter(x => x.level === l.level).length; });

/* ---------- SSML ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TONE = { 'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4], 'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4], 'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4], 'ǖ': ['v', 1], 'ǘ': ['v', 2], 'ǚ': ['v', 3], 'ǜ': ['v', 4], 'ü': ['v', 0] };
function sapi(py) {                           // "xíng" → "xing 2"; chỉ dùng cho từ một âm tiết
  let tone = 5;
  const base = [...py.toLowerCase().trim()].map(c => { const t = TONE[c]; if (!t) return c; if (t[1]) tone = t[1]; return t[0]; }).join('');
  return /^[a-z]+$/.test(base) ? base + ' ' + tone : null;
}
function zhWord(w) {
  const ph = [...w.hanzi].length === 1 ? sapi(w.pinyin) : null;
  return ph ? `<phoneme alphabet="sapi" ph="${ph}">${esc(w.hanzi)}</phoneme>` : esc(w.hanzi);
}
const viText = s => esc(String(s).replace(/\s*;\s*/g, '; ').replace(/\s+/g, ' ').trim());
function wordSsml(w) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">` +
    `<voice name="${VOICE_ZH}"><prosody rate="-15%">${zhWord(w)}</prosody><break time="1200ms"/><prosody rate="-15%">${zhWord(w)}</prosody><break time="700ms"/></voice>` +
    `<voice name="${VOICE_VI}">${viText(w.vi)}<break time="900ms"/></voice>` +
    `<voice name="${VOICE_ZH}"><prosody rate="-10%">${esc(w.exZh)}</prosody><break time="700ms"/></voice>` +
    `<voice name="${VOICE_VI}">${viText(w.exVi)}<break time="2000ms"/></voice></speak>`;
}
const VN_NUM = n => String(n);
function introSsml(l) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${VOICE_VI}">` +
    `Voc-Lang. HSK ${l.level}, bài ${VN_NUM(l.no)}. Từ số ${l.from} đến ${l.to}.<break time="1500ms"/></voice></speak>`;
}
const bill = s => [...s.replace(/<[^>]+>/g, '')].reduce((n, c) => n + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? 2 : 1), 0);
const plainOf = ssml => ssml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/* ---------- Phạm vi ---------- */
let scope = lessons;
if (opt('lesson')) scope = lessons.filter(l => l.id.toUpperCase() === String(opt('lesson')).toUpperCase());
else if (opt('level')) scope = lessons.filter(l => l.level === +opt('level'));
else if (!opt('all') && !opt('dry-run')) { console.error('Chọn --dry-run, --lesson HSK1-01, --level N hoặc --all'); process.exit(1); }
if (!scope.length) { console.error('Không có bài nào khớp'); process.exit(1); }

/* ---------- Danh sách bài (cho PDF 3.6) ---------- */
fs.mkdirSync(path.join(ROOT, 'du-lieu'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'du-lieu/bai-audio.json'), JSON.stringify(lessons.map(l => ({ id: l.id, level: l.level, no: l.no, from: l.from, to: l.to, words: l.words })), null, 1));

if (opt('ssml')) { console.log(introSsml(scope[0])); console.log(wordSsml(scope[0].words[0])); process.exit(0); }

if (opt('dry-run')) {
  const byLevel = {};
  let chars = 0, secs = 0;
  for (const l of scope) {
    let c = bill(plainOf(introSsml(l)));
    for (const w of l.words) c += bill(plainOf(wordSsml(w)));
    // ước tính: zh ~4 chữ/giây (đọc chậm), vi ~13 ký tự/giây, + các khoảng nghỉ
    const s = 3 + l.words.reduce((t, w) => t + 2 * [...w.hanzi].length / 3 + 1.2 + w.vi.length / 13 + core(w.exZh).length / 4 + w.exVi.length / 13 + 5.5, 0);
    chars += c; secs += s;
    const k = 'HSK ' + l.level; byLevel[k] = byLevel[k] || { bai: 0, tu: 0, kyTu: 0, phut: 0 };
    byLevel[k].bai++; byLevel[k].tu += l.words.length; byLevel[k].kyTu += c; byLevel[k].phut += s / 60;
  }
  Object.values(byLevel).forEach(v => { v.phut = Math.round(v.phut); });
  console.table(byLevel);
  console.log('Tổng:', scope.length, 'bài,', scope.reduce((t, l) => t + l.words.length, 0), 'từ,', chars, 'ký tự tính phí, ~' + (secs / 3600).toFixed(1), 'giờ audio,',
    scope.reduce((t, l) => t + l.words.length + 1, 0), 'request (~' + Math.round(scope.reduce((t, l) => t + l.words.length + 1, 0) * GAP_MS / 60000), 'phút ở gói F0)');
  process.exit(0);
}

/* ---------- Azure ---------- */
const envFile = path.join(ROOT, '.azure-speech.env');
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.AZURE_SPEECH_KEY, REGION = env.AZURE_SPEECH_REGION;
if (!KEY || !REGION) { console.error('Thiếu AZURE_SPEECH_KEY / AZURE_SPEECH_REGION trong', envFile); process.exit(1); }

const usageFile = path.join(ROOT, 'du-lieu/azure-usage.json');
const month = new Date().toISOString().slice(0, 7);
const usage = fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : {};
usage[month] = usage[month] || 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function synth(ssml) {
  const c = bill(plainOf(ssml));
  if (usage[month] + c > MONTH_LIMIT) throw new Error('Chạm trần ký tự tháng ' + month + ' (' + usage[month] + '). Dừng để không vượt gói F0.');
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST', body: ssml,
      headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': FORMAT, 'User-Agent': 'voc-lang-tts' }
    }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) {
      usage[month] += c; fs.writeFileSync(usageFile, JSON.stringify(usage, null, 1));
      return Buffer.from(await res.arrayBuffer());
    }
    const body = (await res.text()).slice(0, 200);
    if ((res.status === 429 || res.status >= 500 || res.status === 0) && attempt < 6) {
      const ra = +(res.headers && res.headers.get && res.headers.get('retry-after')) || 0;
      const backoff = Math.max(ra * 1000, 5000 * attempt);
      console.log('  ↻', res.status, 'thử lại sau', backoff / 1000, 's');
      await sleep(backoff); continue;
    }
    throw new Error('Azure lỗi ' + res.status + ': ' + body);
  }
}
const stripId3 = b => (b.slice(0, 3).toString() === 'ID3' ? b.slice(10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f))) : b);
const CACHE = path.join(ROOT, '_tam/audio-cache');
async function clip(ssml) {
  const h = crypto.createHash('sha1').update(VOICE_ZH + VOICE_VI + FORMAT + ssml).digest('hex').slice(0, 16);
  const f = path.join(CACHE, h + '.mp3');
  if (fs.existsSync(f)) return { buf: fs.readFileSync(f), cached: true };
  const buf = await synth(ssml);
  fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, buf);
  return { buf, cached: false };
}

(async () => {
  const t0 = Date.now();
  for (const l of scope) {
    const out = path.join(ROOT, 'audio', 'HSK' + l.level, l.id + '.mp3');
    const parts = [];
    let made = 0;
    try {
      const a = await clip(introSsml(l)); parts.push(stripId3(a.buf)); made += !a.cached;
      for (const w of l.words) { const r = await clip(wordSsml(w)); parts.push(stripId3(r.buf)); made += !r.cached; }
    } catch (e) { console.error('✗', l.id, e.message); process.exit(2); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.concat(parts));
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log('✓', l.id, '—', l.words.length, 'từ,', made, 'clip mới,', kb, 'KB (~' + (kb * 1024 * 8 / 96000 / 60).toFixed(1), 'phút) →', out);
  }
  console.log('Xong', scope.length, 'bài trong', Math.round((Date.now() - t0) / 1000), 's. Ký tự đã dùng tháng', month + ':', usage[month]);
})();
