/* global HanziWriter, Store, bootstrap */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var CJK = /[一-龥]/;
  var STROKE_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/';
  var isTouch = window.matchMedia('(pointer: coarse)').matches;

  var state = {
    deck: [],          // danh sách từ sau khi lọc
    index: 0,
    flipped: false,
    chars: [],         // ký tự đơn của từ hiện tại
    charIndex: 0,
    writer: null,
    outline: true,
    loadToken: null
  };

  /* ============================================================
   * Tiện ích DOM
   * ============================================================ */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function on(sel, evt, fn) { $(sel).addEventListener(evt, fn); }
  /** Gắn sự kiện ủy quyền: fn(event, matchedElement) */
  function delegate(sel, evt, childSel, fn) {
    $(sel).addEventListener(evt, function (e) {
      var el = e.target.closest(childSel);
      if (el && this.contains(el)) fn(e, el);
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Khóa so khớp pinyin: bỏ dấu thanh, dấu cách, ' và -; ü/v → u  ("Xuéxí" → "xuexi") */
  function pyKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[üv]/g, 'u').replace(/[\s'\-:]/g, '');
  }

  /* ============================================================
   * Thanh điệu: tách pinyin có dấu thành âm tiết, tô màu theo thanh 1–4 + thanh nhẹ (5)
   * ============================================================ */
  var TONE_MARK = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };
  var PY_INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w', ''];
  var PY_FINALS = ['iang', 'iong', 'uang', 'ang', 'eng', 'ing', 'ong', 'ian', 'iao', 'uai', 'uan', 'van',
    'ai', 'ao', 'an', 'ei', 'en', 'er', 'ia', 'ie', 'in', 'iu', 'ou', 'ua', 'uo', 'ui', 'un', 'ue', 've', 'vn',
    'a', 'e', 'i', 'o', 'u', 'v'];
  var PY_VOWEL = /[aeiouv]/;

  /** Âm tiết bắt đầu tại i trong chuỗi không dấu (ü = v) → vị trí kết thúc, -1 nếu không khớp */
  function matchSyllable(s, i) {
    for (var a = 0; a < PY_INITIALS.length; a++) {
      var ini = PY_INITIALS[a];
      if (s.substr(i, ini.length) !== ini) continue;
      var j = i + ini.length;
      for (var b = 0; b < PY_FINALS.length; b++) {
        var fin = PY_FINALS[b];
        if (s.substr(j, fin.length) !== fin) continue;
        var k = j + fin.length;
        // -n / -ng / -r không đứng trước nguyên âm (fangan → fan|gan, dàrén → dà|rén)
        if (/(n|ng|r)$/.test(fin) && PY_VOWEL.test(s.charAt(k))) continue;
        if (!ini && !fin) continue;
        if (fin !== 'er' && s.charAt(k) === 'r' && !PY_VOWEL.test(s.charAt(k + 1))) k++;   // nhi hóa: wánr
        return k;
      }
    }
    return -1;
  }

  /** "Xuéxí Hànyǔ." → [{text:'Xué', tone:2}, {text:'xí', tone:2}, {text:' '}, …] */
  function parsePinyin(py) {
    var chars = Array.from(String(py || '').normalize('NFC'));
    var base = [], tones = [];
    chars.forEach(function (c) {
      var d = c.normalize('NFD'), t = 0, b = d.charAt(0).toLowerCase();
      for (var x = 1; x < d.length; x++) {
        if (TONE_MARK[d.charAt(x)]) t = TONE_MARK[d.charAt(x)];
        if (d.charAt(x) === '̈') b = 'v';
      }
      base.push(/[a-zü]/.test(b) ? (b === 'ü' ? 'v' : b) : null);
      tones.push(t);
    });
    var out = [], i = 0;
    while (i < chars.length) {
      if (base[i] === null) {                 // dấu câu, khoảng trắng, chữ số…
        var j0 = i;
        while (i < chars.length && base[i] === null) i++;
        out.push({ text: chars.slice(j0, i).join('') });
        continue;
      }
      var run = i;
      while (run < chars.length && base[run] !== null) run++;
      var s = base.slice(i, run).join('');
      var pos = 0;
      while (pos < s.length) {
        var end = matchSyllable(s, pos);
        if (end < 0) end = pos + 1;           // không phải pinyin chuẩn → giữ nguyên ký tự
        var tone = 0;
        for (var k = i + pos; k < i + end; k++) if (tones[k]) { tone = tones[k]; break; }
        out.push({ text: chars.slice(i + pos, i + end).join(''), tone: tone || 5 });
        pos = end;
      }
      i = run;
    }
    return out;
  }

  function pinyinHtml(py) {
    return parsePinyin(py).map(function (p) {
      return p.tone ? '<span class="t' + p.tone + '">' + esc(p.text) + '</span>' : esc(p.text);
    }).join('');
  }

  /** Tô chữ Hán theo thanh khi số chữ khớp số âm tiết; không khớp (nhi hóa, chữ cái…) thì để nguyên */
  function hanziToneHtml(hz, py) {
    // Mỗi chữ Hán ứng với 1 âm tiết; âm tiết nhi hóa (zhèr) ứng với 2 chữ 这儿 → 儿 lấy cùng thanh
    var slots = [];
    parsePinyin(py).forEach(function (p) {
      if (!p.tone) return;
      slots.push(p.tone);
      if (/r$/i.test(p.text) && !/^[eēéěè]r$/i.test(p.text)) slots.push('r' + p.tone);
    });
    var chars = Array.from(hz || '');
    var cjk = chars.filter(function (c) { return CJK.test(c); });
    if (cjk.length !== slots.length) slots = slots.filter(function (t) { return typeof t === 'number'; });
    if (!cjk.length || cjk.length !== slots.length) return esc(hz);
    var n = 0;
    return chars.map(function (c) {
      if (!CJK.test(c)) return esc(c);
      var t = String(slots[n++]).replace('r', '');
      return '<span class="t' + t + '">' + esc(c) + '</span>';
    }).join('');
  }

  /* ============================================================
   * Tùy chọn giao diện: Sáng/Tối, ẩn Pinyin, ẩn nghĩa, tô màu thanh điệu
   * (key riêng 'hoctq-ui' để không làm các tab khác tải lại)
   * ============================================================ */
  var KEY_UI = 'hoctq-ui';
  var ui = (function () {
    var v = {};
    try { v = JSON.parse(localStorage.getItem(KEY_UI)) || {}; } catch (e) { /* bỏ qua */ }
    return {
      theme: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light',
      pinyin: v.pinyin !== false,
      meaning: v.meaning !== false,
      tone: v.tone !== false,
      themeSaved: !!v.theme
    };
  })();
  function saveUi() {
    try {
      localStorage.setItem(KEY_UI, JSON.stringify({
        theme: ui.themeSaved ? ui.theme : undefined, pinyin: ui.pinyin, meaning: ui.meaning, tone: ui.tone
      }));
    } catch (e) { /* bỏ qua */ }
  }

  function toast(msg) {
    $('#toast-body').innerHTML = msg;
    bootstrap.Toast.getOrCreateInstance($('#app-toast'), { delay: 2500 }).show();
  }

  /* ============================================================
   * Chúc mừng khi xong một mục tiêu: mục tiêu ngày, chuỗi ngày đẹp, cột mốc từ đã thuộc, mở cấp mới.
   * Nhiều thành tích cùng lúc (vd. vừa xong mục tiêu vừa mở cấp) → gộp vào một lần, cái lớn nhất làm tiêu đề.
   * ============================================================ */
  var KEY_CELE = 'hoctq-cele';            // cột mốc "đã thuộc" đã chúc mừng (không có dấu chấm → không bị coi là dữ liệu học)
  var STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
  var MASTERED_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  var CELE = {
    unlock:   { pri: 4, badge: '🔓 Mở khóa cấp mới', zh: '恭喜你！', py: 'Gōngxǐ nǐ! · Chúc mừng bạn!' },
    mastered: { pri: 3, badge: '💎 Cột mốc mới', zh: '你真厉害！', py: 'Nǐ zhēn lìhai! · Bạn giỏi thật đấy!' },
    streak:   { pri: 2, badge: '🔥 Chuỗi ngày học', zh: '坚持就是胜利！', py: 'Jiānchí jiù shì shènglì! · Kiên trì là chiến thắng!' },
    goal:     { pri: 1, badge: '🎯 Mục tiêu hôm nay', zh: '太棒了！', py: 'Tài bàng le! · Tuyệt vời quá!' }
  };
  var cele = { pending: [], timer: null, waiting: null };

  function celeText(ev, d) {
    switch (ev.type) {
      case 'unlock': return {
        title: 'Mở khóa ' + esc(ev.label) + '!',
        sub: 'Bạn đã thuộc 80% từ ' + esc(ev.prev) + '. Cả một kho từ vựng mới đang chờ bạn khám phá!',
        pill: '🔓 Mở ' + esc(ev.label) };
      case 'mastered': return {
        title: 'Đã thuộc ' + ev.n + ' từ!',
        sub: '<b>' + ev.n + ' từ</b> đã nằm gọn trong trí nhớ của bạn. Cứ đà này thì HSK chẳng là gì!',
        pill: '💎 Thuộc ' + ev.n + ' từ' };
      case 'streak': return {
        title: ev.n + ' ngày liên tiếp!',
        sub: 'Ngày nào cũng học đều đặn, trí nhớ của bạn đang cảm ơn bạn đấy. Hôm nay xong <b>' + d.todayCount + '/' + d.dailyGoal + '</b> từ rồi!',
        pill: '🔥 Chuỗi ' + ev.n + ' ngày' };
      default: return {
        title: 'Xong mục tiêu hôm nay rồi!',
        sub: 'Bạn đã học <b>' + d.todayCount + '/' + d.dailyGoal + '</b> từ hôm nay. Giỏi quá, giữ nhịp này nhé!',
        pill: '🎯 Xong mục tiêu ngày' };
    }
  }

  function celebrate(ev, delay) {
    cele.pending.push(ev);
    clearTimeout(cele.timer);
    cele.timer = setTimeout(flushCelebrate, delay || 0);
  }
  function flushCelebrate() {
    var evs = cele.pending.splice(0).sort(function (a, b) { return CELE[b.type].pri - CELE[a.type].pri; });
    if (!evs.length) return;
    var modal = $('#cele-modal'), open = document.querySelector('.modal.show');
    if (open === modal) {                       // đang chúc mừng → chờ đóng rồi hiện tiếp
      cele.waiting = (cele.waiting || []).concat(evs);
      return;
    }
    if (!modal || open) {                       // đang mở Cài đặt / Tài liệu… → chỉ báo nhẹ
      var d0 = Store.getDaily();
      toast('🎉 ' + celeText(evs[0], d0).title);
      return;
    }
    var d = Store.getDaily(), s = Store.summary(), main = evs[0], t = celeText(main, d), meta = CELE[main.type];
    $('#cele-badge').textContent = meta.badge;
    $('#cele-title').innerHTML = t.title;
    $('#cele-zh').textContent = meta.zh;
    $('#cele-py').textContent = meta.py;
    $('#cele-sub').innerHTML = t.sub;
    $('#cele-today').textContent = d.todayCount;
    $('#cele-streak').textContent = d.streakCount;
    $('#cele-mastered').textContent = s.mastered;
    $('#cele-extra').innerHTML = evs.slice(1).map(function (e) {
      return '<span class="cele-pill">' + celeText(e, d).pill + '</span>';
    }).join('');
    bootstrap.Modal.getOrCreateInstance(modal).show();
    confetti();
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    var colors = ['#14B8A6', '#F59E0B', '#F43F5E', '#3B82F6', '#8B5CF6', '#FBBF24', '#34D399', '#FB7185'];
    var html = '';
    for (var i = 0; i < 80; i++) {
      var shape = i % 3 === 1 ? ' is-round' : i % 3 === 2 ? ' is-strip' : '';
      html += '<i class="confetti-piece' + shape + '" style="left:' + (Math.random() * 100).toFixed(1) + '%;' +
        'background:' + colors[i % colors.length] + ';' +
        'animation-delay:' + (Math.random() * .7).toFixed(2) + 's;' +
        'animation-duration:' + (2.2 + Math.random() * 1.6).toFixed(2) + 's;' +
        '--drift:' + Math.round(Math.random() * 180 - 90) + 'px;' +
        '--spin:' + Math.round((360 + Math.random() * 720) * (Math.random() < .5 ? -1 : 1)) + 'deg"></i>';
    }
    layer.innerHTML = html;
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 4800);
  }

  /** Cột mốc "đã thuộc" vừa vượt qua (chỉ chúc mừng mỗi mốc một lần trên máy này) */
  function masteredMilestone(before, after) {
    if (after <= before) return 0;
    var done = 0;
    try { done = (JSON.parse(localStorage.getItem(KEY_CELE)) || {}).mastered || 0; } catch (e) { /* bỏ qua */ }
    var hit = 0;
    MASTERED_MILESTONES.forEach(function (m) { if (before < m && after >= m && m > done) hit = m; });
    if (hit) try { localStorage.setItem(KEY_CELE, JSON.stringify({ mastered: hit })); } catch (e) { /* bỏ qua */ }
    return hit;
  }
  /** Xong mục tiêu ngày: chuỗi ngày rơi đúng mốc đẹp → chúc mừng chuỗi, không thì chúc mừng mục tiêu */
  function goalEvent() {
    var n = Store.getDaily().streakCount;
    return STREAK_MILESTONES.indexOf(n) >= 0 ? { type: 'streak', n: n } : { type: 'goal' };
  }

  function splitChars(text) {
    // Lọc dấu câu / khoảng trắng, chỉ giữ ký tự trong dải CJK 一-龥
    return Array.from(text || '').filter(function (c) { return CJK.test(c); });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    var diff = ts - Date.now();
    if (diff <= 0) return 'Đến hạn';
    var h = diff / 36e5;
    if (h < 1) return Math.ceil(diff / 6e4) + ' phút nữa';
    if (h < 24) return Math.round(h) + ' giờ nữa';
    return Math.round(h / 24) + ' ngày nữa';
  }

  /* Tên hiển thị cho thẻ (tags). Thẻ không có trong bảng: "abc-xyz" → "Abc xyz". */
  var WORD_CLASS_TAGS = {
    'dong-tu': 'Động từ', 'danh-tu': 'Danh từ', 'tinh-tu': 'Tính từ', 'dai-tu': 'Đại từ',
    'pho-tu': 'Phó từ', 'luong-tu': 'Lượng từ', 'tro-tu': 'Trợ từ', 'gioi-tu': 'Giới từ',
    'lien-tu': 'Liên từ', 'so-dem': 'Số đếm', 'nghi-van': 'Nghi vấn'
  };
  var TOPIC_TAGS = {
    'giao-tiep': 'Giao tiếp', 'hoc-tap': 'Học tập', 'thoi-gian': 'Thời gian', 'dia-diem': 'Địa điểm',
    'an-uong': 'Ăn uống', 'phuong-huong': 'Phương hướng', 'gia-dinh': 'Gia đình', 'giao-thong': 'Giao thông',
    'cam-xuc': 'Cảm xúc', 'do-uong': 'Đồ uống', 'con-nguoi': 'Con người', 'so-luong': 'Số lượng',
    'sinh-hoat': 'Sinh hoạt', 'mua-sam': 'Mua sắm', 'ngon-ngu': 'Ngôn ngữ', 'dia-danh': 'Địa danh',
    'cong-viec': 'Công việc', 'do-vat': 'Đồ vật', 'giai-tri': 'Giải trí', 'nha-cua': 'Nhà cửa',
    'nghe-nghiep': 'Nghề nghiệp', 'thoi-tiet': 'Thời tiết', 'tien-te': 'Tiền tệ', 'suc-khoe': 'Sức khỏe',
    'nhan-thuc': 'Nhận thức', 'the-thao': 'Thể thao', 'mau-sac': 'Màu sắc', 'thien-nhien': 'Thiên nhiên',
    'cong-nghe': 'Công nghệ', 'trang-phuc': 'Trang phục', 'dong-vat': 'Động vật',
    'du-lich': 'Du lịch', 'co-the': 'Cơ thể', 'van-hoa': 'Văn hóa',
    'thanh-ngu': 'Thành ngữ', 'xa-hoi': 'Xã hội', 'phap-luat': 'Pháp luật', 'khoa-hoc': 'Khoa học'
  };
  function tagLabel(t) {
    if (WORD_CLASS_TAGS[t]) return WORD_CLASS_TAGS[t];
    if (TOPIC_TAGS[t]) return TOPIC_TAGS[t];
    var s = String(t).replace(/[-_]+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  var STATUS_TEXT = { new: 'Mới', learning: 'Đang học', mastered: 'Đã thuộc' };
  var STATUS_LABEL = {};
  Object.keys(STATUS_TEXT).forEach(function (k) {
    STATUS_LABEL[k] = '<span class="status-chip status-' + k + '"><span class="dot dot-' + k + '"></span>' + STATUS_TEXT[k] + '</span>';
  });
  /** "sau 10 phút", "sau 3 ngày"… so với bây giờ */
  function fromNow(t) {
    var d = t - Date.now();
    if (d <= 60 * 1000) return 'bây giờ';
    var m = Math.round(d / 60000);
    if (m < 60) return 'sau ' + m + ' phút';
    var h = Math.round(m / 60);
    if (h < 24) return 'sau ' + h + ' giờ';
    return 'sau ' + Math.round(h / 24) + ' ngày';
  }

  var EXAMPLE_TYPE = {
    basic: { label: 'Câu đơn giản', cls: 'ex-basic' },
    simple: { label: 'Câu đơn', cls: 'ex-simple' },
    compound: { label: 'Câu ghép', cls: 'ex-compound' }
  };

  /* ============================================================
   * Stroke Engine: tải + cache dữ liệu nét chữ
   * ============================================================ */
  var strokeMem = {};
  function loadStroke(ch) {
    if (strokeMem[ch]) return strokeMem[ch];
    var cached = Store.getStroke(ch);
    if (cached) { strokeMem[ch] = Promise.resolve(cached); return strokeMem[ch]; }
    strokeMem[ch] = fetch(STROKE_CDN + encodeURIComponent(ch) + '.json')
      .then(function (r) { if (!r.ok) throw new Error('Không có dữ liệu nét cho ' + ch); return r.json(); })
      .then(function (data) { Store.saveStroke(ch, data); return data; })
      .catch(function (e) { delete strokeMem[ch]; throw e; });
    return strokeMem[ch];
  }

  function preloadWord(word) {
    if (!word) return;
    splitChars(word.hanzi).forEach(function (c) { loadStroke(c).catch(function () {}); });
  }

  /* ============================================================
   * Audio Engine (Web Speech API)
   * ============================================================ */
  /* Giọng do hệ điều hành cung cấp nên mỗi máy một khác. Chọn giọng phổ thông chuẩn theo thứ tự:
   *   Google 普通话 (Android, Chrome) → Tingting (iOS, macOS) → Xiaoxiao/Huihui… (Windows, Edge)
   * Bỏ qua các giọng "vui" của Apple (Eddy, Grandpa…). Không khớp tên nào thì lấy giọng
   * tiếng Trung đại lục đầu tiên như trước. */
  var VOICE_PREFS = [/google/i, /ting-?ting|婷婷/i, /xiaoxiao|xiaoyi|yaoyao|huihui/i];
  var NOVELTY_VOICE = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
  function voiceScore(v) {
    var lang = String(v.lang || ''), name = String(v.name || '');
    var mainland = /^(zh|cmn)[-_](cn|hans)/i.test(lang) || /普通话|mandarin|china mainland|中国大陆/i.test(name);
    if (!mainland && !/^(zh|cmn)/i.test(lang)) return -1;    // không phải giọng tiếng Trung
    var score = mainland ? 100 : 0;                          // ưu tiên phổ thông đại lục hơn Đài/HK
    if (NOVELTY_VOICE.test(name)) score -= 50;
    for (var i = 0; i < VOICE_PREFS.length; i++) {
      if (VOICE_PREFS[i].test(name)) { score += (VOICE_PREFS.length - i) * 10; break; }
    }
    if (/enhanced|premium|natural|优化/i.test(name)) score += 2; // bản chất lượng cao nếu máy đã tải
    return score;
  }
  var zhVoice = null;
  function pickVoice() {
    var best = null, bestScore = -1;
    window.speechSynthesis.getVoices().forEach(function (v) {
      var s = voiceScore(v);
      if (s > bestScore) { best = v; bestScore = s; }       // bằng điểm thì giữ giọng đứng trước
    });
    zhVoice = best;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  var warnedNoVoice = false;
  function speak(text) {
    if (!text) return;
    if (!('speechSynthesis' in window)) { toast('Trình duyệt không hỗ trợ phát âm.'); return; }
    if (!zhVoice) pickVoice();                            // iOS có thể nạp danh sách giọng muộn
    window.speechSynthesis.cancel();                      // tránh đọc dồn
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.85;
    if (zhVoice) u.voice = zhVoice;
    else if (!warnedNoVoice) {
      warnedNoVoice = true;
      toast('Máy chưa có giọng đọc tiếng Trung — hãy cài gói giọng <b>Chinese (Simplified)</b> trong cài đặt hệ điều hành.');
    }
    window.speechSynthesis.speak(u);
  }

  /* ============================================================
   * Dữ liệu theo cấp HSK: js/data/levels.js liệt kê các cấp có sẵn,
   * mỗi cấp nằm trong js/data/hskN.js và chỉ được tải khi cần.
   * ============================================================ */
  var KEY_HSK = 'hoctq.hsk';
  var levelPromises = {};

  function availableLevels() { return window.HSK_LEVELS || []; }

  function loadLevel(n) {
    if (window.HSK_DATA && window.HSK_DATA[n]) return Promise.resolve();
    if (!levelPromises[n]) {
      levelPromises[n] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'js/data/hsk' + n + '.js';
        s.onload = function () {
          // Gắn khóa cấp cho từng từ → tính tiến độ theo cấp; bổ sung cho bản ghi tiến độ cũ
          var words = (window.HSK_DATA || {})[n] || [];
          words.forEach(function (w) { w.set = n; });
          Store.backfillSet(n, words);
          resolve();
        };
        s.onerror = function () { delete levelPromises[n]; reject(new Error('Không tải được dữ liệu HSK ' + n)); };
        document.head.appendChild(s);
      });
    }
    return levelPromises[n];
  }

  /* ============================================================
   * Lộ trình: các cấp mở lần lượt. Thuộc ≥ 80% số từ của một cấp thì mở cấp tiếp theo.
   * Đã mở thì không khóa lại; người đã có nền tảng chọn "cấp bắt đầu" trong Cài đặt.
   * ============================================================ */
  var UNLOCK_RATIO = 0.8;
  var lastUnlocked = null;

  function needToUnlock(l) { return Math.ceil(l.count * UNLOCK_RATIO); }

  /* Tài khoản quản trị (email khớp ADMIN_EMAIL_SHA256 trong js/firebase-config.js): mở mọi cấp để soát nội dung, quay video.
   * Chỉ là hiển thị trên máy này, không ghi vào lộ trình đã lưu (dữ liệu từ vựng vốn công khai, không phải quyền truy cập). */
  var adminAll = false;
  function checkAdmin() {
    var i = window.Cloud && Cloud.info ? Cloud.info() : null;
    var email = i && i.mode === 'user' ? String(i.email || '').trim().toLowerCase() : '';
    var done = function (v) {
      if (v === adminAll) return;
      adminAll = v;
      lastUnlocked = unlockedCount();   // không bật màn "Mở khóa cấp mới" khi đổi tài khoản
      refreshAll(); renderDashboard();
    };
    if (!email || !window.ADMIN_EMAIL_SHA256 || !window.crypto || !crypto.subtle) return done(false);
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)).then(function (buf) {
      var h = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      done(h === window.ADMIN_EMAIL_SHA256);
    }, function () { done(false); });
  }

  /** Số cấp đang mở (tính từ đầu danh sách levels.js); lưu lại khi mở thêm cấp mới */
  function unlockedCount(summary) {
    if (adminAll) return availableLevels().length;
    var levels = availableLevels(), st = Store.getSettings();
    var s = summary || Store.summary();
    var n = Math.min(levels.length, Math.max(st.unlocked, st.startLevel, 1));
    while (n < levels.length) {
      var prev = levels[n - 1], b = s.bySet[String(prev.level)] || { mastered: 0 };
      if (b.mastered >= needToUnlock(prev)) n++; else break;
    }
    if (n > st.unlocked) { st.unlocked = n; Store.saveSettings(st, true); }
    return n;
  }
  function unlockedKeys() {
    return availableLevels().slice(0, unlockedCount()).map(function (l) { return String(l.level); });
  }
  function isUnlocked(key) { return unlockedKeys().indexOf(String(key)) >= 0; }

  /** Tải dữ liệu cho lựa chọn hiện tại của bộ lọc ('' = mọi cấp đã mở). */
  function ensureLoaded(hsk) {
    return Promise.all((hsk ? [hsk] : unlockedKeys()).map(loadLevel));
  }

  /** Từ thuộc cấp đang chọn (hoặc mọi cấp đã mở). */
  function vocabInFilter() {
    var hsk = $('#filter-hsk').value, data = window.HSK_DATA || {};
    // hsk = khóa bộ dữ liệu ('3', '7-9-p1' …); HSK 7-9 chia nhiều phần nên lọc theo bộ dữ liệu chứ không theo hsk_level
    if (hsk) return (data[hsk] || []).slice();
    return unlockedKeys().reduce(function (all, k) { return all.concat(data[k] || []); }, []);
  }

  /* ============================================================
   * Bộ thẻ
   * ============================================================ */
  function buildDeck(keepCurrentId) {
    var hsk = $('#filter-hsk').value;
    $('#deck-stats').innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang tải dữ liệu…';
    return ensureLoaded(hsk).then(function () {
      renderTagFilter();
      fillDeck(keepCurrentId);
      renderList();
    }, function (err) {
      $('#deck-stats').textContent = err.message;
      toast(esc(err.message) + ' — hãy chạy lại cap-nhat-du-lieu.bat');
    });
  }

  function fillDeck(keepCurrentId) {
    var mode = $('#filter-mode').value;
    var now = Date.now();
    var progress = Store.getAllProgress();

    state.deck = vocabInStudyFilter().filter(function (v) {
      var p = progress[v.id];
      var st = p ? p.status : 'new';
      if (mode === 'due') return Store.isDue(p, now);   // đang học hoặc tới hạn ôn
      if (mode !== 'all') return st === mode;            // new | learning | mastered
      return true;
    });
    // Chế độ ôn tập: từ tới hạn sớm nhất lên trước
    if (mode === 'due') state.deck.sort(function (a, b) { return progress[a.id].nextReview - progress[b.id].nextReview; });

    var idx = 0;
    if (keepCurrentId) {
      var found = state.deck.findIndex(function (v) { return v.id === keepCurrentId; });
      if (found >= 0) idx = found;
    }
    state.index = Math.min(idx, Math.max(0, state.deck.length - 1));
    renderDeckStats();
    renderCard();
  }

  /** Chấm vàng trên nút Bộ lọc (điện thoại) khi đang lọc theo trạng thái hoặc chủ đề */
  function renderFilterDot() {
    var active = $('#filter-mode').value !== 'new' || !!$('#filter-tag').value;   // mặc định: từ mới
    $('#filter-dot').classList.toggle('d-none', !active);
  }

  function renderHskFilter() {
    var levels = availableLevels();
    var s = $('#filter-hsk');
    var saved = null;
    try { saved = localStorage.getItem(KEY_HSK); } catch (e) { /* bỏ qua */ }
    var open = unlockedCount();
    s.innerHTML = levels.map(function (l, i) {
      var locked = i >= open;
      return '<option value="' + esc(l.level) + '"' + (locked ? ' disabled' : '') + '>' +
        (locked ? '🔒 ' : '') + esc(l.label || 'HSK ' + l.level) + ' (' + l.count + ' từ)</option>';
    }).join('') + (open > 1 ? '<option value="">Mọi cấp đã mở</option>' : '');
    // Mặc định: cấp đã chọn lần trước nếu còn mở, không thì cấp mở cao nhất
    var valid = Array.prototype.some.call(s.options, function (o) { return o.value === saved && !o.disabled; });
    s.value = valid ? saved : (levels[open - 1] ? String(levels[open - 1].level) : '');
  }

  function renderDeckStats() {
    var all = vocabInStudyFilter(), progress = Store.getAllProgress(), now = Date.now();
    var due = 0, mastered = 0, fresh = 0;
    var learning = 0;
    all.forEach(function (v) {
      var p = progress[v.id];
      if (!p || p.status === 'new') fresh++;
      else {
        if (p.status === 'mastered') mastered++; else learning++;
        if (Store.isDue(p, now)) due++;
      }
    });
    $('#deck-stats').innerHTML =
      '<i class="bi bi-collection"></i> ' + all.length + ' từ · ' +
      '<span>' + fresh + ' mới</span> · ' +
      '<span class="txt-learning">' + learning + ' đang học</span> · ' +
      '<span class="txt-mastered">' + mastered + ' đã thuộc</span>' +
      (due ? ' · <span class="txt-due">' + due + ' cần ôn</span>' : '');
    renderFilterDot();
  }

  /* ============================================================
   * Tổng quan tiến độ: chuỗi ngày, mục tiêu hôm nay, số từ đã thuộc
   * ============================================================ */
  function renderDashboard() {
    var d = Store.getDaily(), s = Store.summary();
    var pct = Math.min(100, Math.round(d.todayCount / d.dailyGoal * 100));
    $('#dash-streak').textContent = d.streakCount;
    $('#dash-fire').classList.toggle('lit', d.streakCount > 0 && d.lastStudyDate === Store.dayKey());
    $('#dash-today').textContent = d.todayCount;
    $('#dash-goal').textContent = d.dailyGoal;
    $('#dash-goal-bar').style.width = pct + '%';
    $('#dash-goal-bar').classList.toggle('done', pct >= 100);
    $('#dash-goal-bar-wrap').setAttribute('aria-valuenow', pct);
    $('#dash-mastered').textContent = s.mastered;
    $('#dash-due').textContent = s.due;
    $('#btn-review-due').disabled = !s.due;
    $('#nav-due').textContent = s.due > 99 ? '99+' : s.due;
    $('#nav-due').classList.toggle('d-none', !s.due);
    $('#btn-dash').setAttribute('aria-label', 'Tiến độ' + (s.due ? ' (' + s.due + ' từ cần ôn)' : ''));

    // Lộ trình: báo khi vừa mở cấp mới, và nhắc còn bao nhiêu từ để mở cấp tiếp theo
    var levels = availableLevels(), open = unlockedCount(s);
    if (lastUnlocked !== null && open > lastUnlocked) {
      celebrate({ type: 'unlock', label: levels[open - 1].label, prev: (levels[open - 2] || {}).label || 'cấp trước' });
      renderHskFilter();
    }
    lastUnlocked = open;
    var hint = $('#dash-unlock');
    if (open < levels.length) {
      var cur = levels[open - 1], next = levels[open];
      var have = (s.bySet[String(cur.level)] || { mastered: 0 }).mastered, need = needToUnlock(cur);
      hint.innerHTML = '<i class="bi bi-lock"></i> Mở <b>' + esc(next.label) + '</b>: thuộc ' +
        '<b>' + have + '/' + need + '</b> từ ' + esc(cur.label) + ' (80%)' +
        '<div class="progress unlock-bar"><div class="progress-bar" style="width:' + Math.min(100, have / need * 100).toFixed(1) + '%"></div></div>';
      hint.classList.remove('d-none');
    } else hint.classList.add('d-none');
    renderLevelProgress(s);
  }

  /** Thanh tiến độ nhỏ cho từng cấp HSK (tab Từ vựng) */
  function renderLevelProgress(s) {
    s = s || Store.summary();
    var open = unlockedCount(s);
    $('#level-progress').innerHTML = availableLevels().map(function (l, i) {
      var b = s.bySet[String(l.level)] || { learning: 0, mastered: 0 };
      var pm = l.count ? b.mastered / l.count * 100 : 0, pl = l.count ? b.learning / l.count * 100 : 0;
      var locked = i >= open;
      return '<div class="lvl-row' + (locked ? ' locked' : '') + '"' +
        (locked ? ' title="Thuộc 80% từ của cấp trước để mở"' : '') + '>' +
        '<span class="lvl-name">' + (locked ? '<i class="bi bi-lock-fill"></i> ' : '') + esc(l.label || 'HSK ' + l.level) + '</span>' +
        '<div class="progress lvl-bar" title="' + b.mastered + ' đã thuộc · ' + b.learning + ' đang học · ' + (l.count - b.mastered - b.learning) + ' mới">' +
          '<div class="progress-bar bar-mastered" style="width:' + pm.toFixed(2) + '%"></div>' +
          '<div class="progress-bar bar-learning" style="width:' + pl.toFixed(2) + '%"></div>' +
        '</div>' +
        '<span class="lvl-num">' + b.mastered + '/' + l.count + '</span>' +
      '</div>';
    }).join('');
  }

  function currentWord() { return state.deck[state.index]; }

  function renderCard() {
    var w = currentWord();
    $('#empty-deck').classList.toggle('d-none', !!w);
    if (!w) $('#empty-deck').innerHTML = $('#filter-mode').value === 'new' && !$('#filter-tag').value
      ? 'Bạn đã học hết từ mới của cấp này. Chọn trạng thái <b>Ôn tập từ cần nhớ</b> để ôn lại, hoặc chọn cấp HSK khác.'
      : 'Không có từ nào phù hợp bộ lọc. Hãy đổi trạng thái, chủ đề hoặc cấp HSK.';
    $('#study-area').classList.toggle('d-none', !w);
    if (!w) { destroyWriter(); return; }

    setFlipped(false);
    var front = $('#card-hanzi');
    front.textContent = w.hanzi;
    front.style.fontSize = w.hanzi.length > 3 ? 'clamp(2.5rem, 9vw, 4.5rem)' : '';
    $('#card-hsk').textContent = 'HSK ' + w.hsk_level;
    var layer = $('#swipe-layer');
    layer.classList.remove('enter'); void layer.offsetWidth; layer.classList.add('enter');

    $('#back-hanzi').innerHTML = hanziToneHtml(w.hanzi, w.pinyin);
    $('#back-trad').textContent = w.traditional && w.traditional !== w.hanzi ? '(' + w.traditional + ')' : '';
    $('#back-pinyin').innerHTML = pinyinHtml(w.pinyin);
    $('#back-meaning').textContent = w.meaning_vi;
    $$('#flashcard .peek').forEach(function (el) { el.classList.remove('peek'); });
    renderImage($('#back-image'), w.image);
    $('#back-tags').innerHTML = (w.tags || []).map(function (t) {
      return '<span class="tag-chip">' + esc(tagLabel(t)) + '</span>';
    }).join('');
    $('#back-explain').textContent = w.explanation || '';
    var related = w.related || [];
    $('#back-related').innerHTML = !related.length ? '' :
      '<div class="section-box">' +
        '<div class="section-title"><i class="bi bi-book"></i> Từ vựng liên quan</div>' +
        '<div class="related-grid">' + related.map(function (r) {
          return '<button type="button" class="related-row" data-zh="' + esc(r.hanzi) + '" title="Chạm để nghe">' +
            '<span class="rel-zh zh">' + esc(r.hanzi) + '</span>' +
            '<span class="rel-py peekable" data-peek="pinyin">' + pinyinHtml(r.pinyin) + '</span>' +
            '<span class="rel-colon">·</span>' +
            '<span class="rel-vi peekable" data-peek="meaning">' + esc(r.vi) + '</span></button>';
        }).join('') + '</div>' +
      '</div>';
    $('#back-examples').innerHTML = !(w.examples || []).length ? '' :
      '<div class="section-title mt-1"><i class="bi bi-chat-quote"></i> Ví dụ</div>' +
      w.examples.map(function (ex, i) {
      var t = EXAMPLE_TYPE[ex.type];
      return '<div class="example">' +
        (t ? '<span class="ex-badge ' + t.cls + '">' + t.label + '</span>' : '') +
        '<div class="ex-zh zh">' + esc(ex.zh) + '</div>' +
        '<div class="ex-py peekable" data-peek="pinyin">' + pinyinHtml(ex.pinyin) + '</div>' +
        '<div class="ex-vi peekable" data-peek="meaning">' + esc(ex.vi) + '</div>' +
        '<button type="button" class="btn-speak-ex" data-ex="' + i + '" title="Nghe câu" aria-label="Nghe câu"><i class="bi bi-volume-up"></i></button></div>';
    }).join('');
    $('.back-scroll').scrollTop = 0;

    renderReviewInfo();

    // Vở tập viết
    state.chars = splitChars(w.hanzi);
    state.charIndex = 0;
    renderCharTabs();
    loadWriterChar();

    // Preload từ tiếp theo
    preloadWord(state.deck[(state.index + 1) % state.deck.length]);
  }

  /** Ảnh minh họa: link ảnh (http/https/data:image) → <img>, còn lại coi là emoji. */
  function isImageUrl(s) { return /^(https?:\/\/|data:image\/)/i.test(s || ''); }
  function renderImage(el, src) {
    el.classList.toggle('d-none', !src);
    el.classList.toggle('is-emoji', !!src && !isImageUrl(src));
    if (!src) { el.innerHTML = ''; return; }
    if (isImageUrl(src)) {
      el.innerHTML = '<img src="' + esc(src) + '" alt="" loading="lazy">';
      el.querySelector('img').onerror = function () { el.classList.add('d-none'); };
    } else {
      el.textContent = src;
    }
  }

  function renderReviewInfo() {
    var w = currentWord(); if (!w) return;
    var p = Store.getProgress(w.id);
    $('#card-status').innerHTML = STATUS_LABEL[p.status];
    $('#review-info').innerHTML = STATUS_LABEL[p.status] +
      (p.status === 'new' ? ' · Chưa học lần nào'
        : ' · <span class="txt-ok">' + p.correctCount + ' đúng</span> · <span class="txt-bad">' + p.wrongCount + ' sai</span>' +
          ' · Ôn lại ' + fromNow(p.nextReview));
    // Gợi ý khoảng ôn cho nút "Tạm nhớ" theo số lần đúng liên tiếp
    var next = p.streak + 1;
    $('#rate-good-hint').textContent = next >= 3 ? 'thuộc · ôn sau 7 ngày' : 'ôn lại sau ' + (next === 1 ? 1 : 3) + ' ngày';
  }

  function setFlipped(v) {
    state.flipped = v;
    $('#flashcard').classList.toggle('flipped', v);
    $('.back-scroll').scrollTop = 0;     // mỗi lần lật, mặt sau luôn bắt đầu từ đầu thẻ
  }

  function go(delta) {
    if (!state.deck.length) return;
    state.index = (state.index + delta + state.deck.length) % state.deck.length;
    renderCard();
  }

  var RATE_TEXT = { again: 'Chưa nhớ', good: 'Tạm nhớ', mastered: 'Đã thuộc' };
  function rate(kind) {
    var w = currentWord(); if (!w || !RATE_TEXT[kind]) return;
    var before = Store.summary().mastered;
    var res = Store.rate(w.id, kind, w.set);
    var hit = masteredMilestone(before, Store.summary().mastered);
    if (hit) celebrate({ type: 'mastered', n: hit });
    if (res.goalReached) celebrate(goalEvent());
    if (!hit && !res.goalReached) toast(RATE_TEXT[kind] + ' · ôn lại ' + fromNow(res.progress.nextReview));
    renderDeckStats();
    renderList();
    if ($('#filter-mode').value === 'all') { go(1); }
    else {
      // Từ vừa chấm có thể không còn thuộc bộ lọc → dựng lại bộ thẻ
      var nextId = state.deck[(state.index + 1) % state.deck.length].id;
      buildDeck(nextId === w.id ? null : nextId);
    }
  }

  /* ============================================================
   * Vở tập viết (Hanzi Writer)
   * ============================================================ */
  /** Cạnh ô viết: máy tính 320px; điện thoại/máy tính bảng theo chiều rộng màn hình (240–360px).
   *  Chỉ phụ thuộc chiều rộng → thanh địa chỉ iOS co/giãn không làm mất nét đang viết. */
  function padSize() {
    if (window.innerWidth >= 992) return 320;
    return Math.max(240, Math.min(360, window.innerWidth - 64));
  }

  /** Màu ô viết lấy từ biến CSS → đúng cả chế độ Sáng và Tối */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function gridSvg(size) {
    var s = size, h = s / 2;
    var dash = 'stroke="' + cssVar('--writer-grid') + '" stroke-width="1" stroke-dasharray="6,5"';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" id="writer-svg">' +
      '<rect x="1" y="1" width="' + (s - 2) + '" height="' + (s - 2) + '" rx="10" fill="none" stroke="' + cssVar('--writer-frame') + '" stroke-width="2"/>' +
      '<line x1="0" y1="' + h + '" x2="' + s + '" y2="' + h + '" ' + dash + '/>' +
      '<line x1="' + h + '" y1="0" x2="' + h + '" y2="' + s + '" ' + dash + '/>' +
      '<line x1="0" y1="0" x2="' + s + '" y2="' + s + '" ' + dash + '/>' +
      '<line x1="' + s + '" y1="0" x2="0" y2="' + s + '" ' + dash + '/>' +
      '</svg>';
  }

  function renderCharTabs() {
    $('#char-tabs').innerHTML = state.chars.length < 2 ? '' : state.chars.map(function (c, i) {
      return '<li><button type="button" class="char-tab' + (i === state.charIndex ? ' active' : '') +
        '" data-i="' + i + '" aria-label="Tập viết chữ ' + esc(c) + '">' + esc(c) + '</button></li>';
    }).join('');
  }

  function destroyWriter() {
    if (state.writer) { try { state.writer.cancelQuiz(); } catch (e) { /* bỏ qua */ } }
    state.writer = null;
    $('#writer-box').innerHTML = '';
  }

  /** cls: st-ok | st-bad | st-hint | st-warn | '' (mặc định: chữ phụ) */
  function setStatus(html, cls) {
    var el = $('#writer-status');
    el.className = 'writer-status ' + (cls || '');
    el.innerHTML = html || '&nbsp;';
  }

  function loadWriterChar() {
    destroyWriter();
    var ch = state.chars[state.charIndex];
    if (!ch) { setStatus('Từ này không có ký tự Hán hợp lệ để tập viết.', 'st-bad'); return; }

    var size = padSize();
    var box = $('#writer-box');
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    box.innerHTML = gridSvg(size);
    setStatus('<span class="spinner-border spinner-border-sm"></span> Đang tải nét chữ…');

    var token = {};
    state.loadToken = token;

    state.writer = HanziWriter.create(document.getElementById('writer-svg'), ch, {
      width: size,
      height: size,
      padding: 14,
      showOutline: state.outline,
      showCharacter: false,
      strokeColor: cssVar('--writer-stroke'),
      radicalColor: cssVar('--writer-radical'),
      outlineColor: cssVar('--writer-outline'),
      highlightColor: cssVar('--primary'),
      drawingColor: cssVar('--writer-stroke'),
      drawingWidth: isTouch ? 24 : 18,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 250,
      showHintAfterMisses: false,   // tự xử lý Auto-Hint bên dưới
      highlightOnComplete: true,
      charDataLoader: function (c, onLoad, onError) { loadStroke(c).then(onLoad, onError); },
      onLoadCharDataSuccess: function () {
        if (state.loadToken !== token) return;
        setStatus('&nbsp;');
        startQuiz();
      },
      onLoadCharDataError: function () {
        if (state.loadToken !== token) return;
        setStatus('Không tải được dữ liệu nét chữ (kiểm tra kết nối mạng).', 'st-bad');
      }
    });
    renderWritingStats();
  }

  function shakePad() {
    var b = $('#writer-box');
    b.classList.remove('shake');
    void b.offsetWidth;            // khởi động lại animation
    b.classList.add('shake');
  }

  function startQuiz() {
    var w = state.writer; if (!w) return;
    var ch = state.chars[state.charIndex];
    w.cancelQuiz();
    w.hideCharacter();
    setStatus('Viết nét đầu tiên theo đúng thứ tự…');

    w.quiz({
      onMistake: function (sd) {
        if (navigator.vibrate) navigator.vibrate(50);
        shakePad();
        if (sd.mistakesOnStroke >= 3) {
          w.highlightStroke(sd.strokeNum);
          setStatus('Gợi ý: theo nét đang nháy sáng (nét ' + (sd.strokeNum + 1) + ')', 'st-hint');
        } else {
          setStatus('Chưa đúng nét ' + (sd.strokeNum + 1) + ' — sai hướng hoặc sai thứ tự (' + sd.mistakesOnStroke + '/3)', 'st-bad');
        }
      },
      onCorrectStroke: function (sd) {
        setStatus('Đúng! Còn ' + sd.strokesRemaining + ' nét', 'st-ok');
      },
      onComplete: function (summary) {
        var word = currentWord();
        if (word && Store.recordWriting(word.id, ch, summary.totalMistakes, word.set).goalReached) {
          celebrate(goalEvent(), 1500);   // đợi xem kết quả nét viết / chuyển chữ xong rồi mới hiện
        }
        renderWritingStats();
        var msg = summary.totalMistakes === 0
          ? '🎉 Hoàn hảo! Không sai nét nào.'
          : 'Hoàn thành với ' + summary.totalMistakes + ' nét sai.';
        var hasNext = state.charIndex < state.chars.length - 1;
        setStatus(msg + (hasNext ? ' Chuyển sang chữ tiếp theo…' : ''), summary.totalMistakes ? 'st-warn' : 'st-ok');
        if (hasNext) setTimeout(function () { selectChar(state.charIndex + 1); }, 1200);
      }
    });
  }

  function animate() {
    var w = state.writer; if (!w) return;
    w.cancelQuiz();
    setStatus('Đang vẽ mẫu thứ tự nét…');
    w.hideCharacter();
    w.animateCharacter({
      onComplete: function () { setStatus('Xong. Nhấn <b>Viết lại</b> để tự viết.'); }
    });
  }

  function selectChar(i) {
    state.charIndex = i;
    $$('#char-tabs .char-tab').forEach(function (b) { b.classList.toggle('active', +b.dataset.i === i); });
    loadWriterChar();
  }

  function renderWritingStats() {
    var w = currentWord(), ch = state.chars[state.charIndex];
    var el = $('#writing-stats');
    if (!w || !ch) { el.innerHTML = ''; return; }
    var s = Store.getProgress(w.id).writing[ch];
    el.innerHTML = s
      ? 'Chữ <span class="zh">' + esc(ch) + '</span>: đã viết ' + s.attempts + ' lần · tổng ' + s.total_mistakes + ' nét sai'
      : 'Chữ <span class="zh">' + esc(ch) + '</span>: chưa tập viết';
  }

  /* ============================================================
   * Danh sách từ vựng
   * ============================================================ */
  var listPage = 1;

  function listPageSize() { return +$('#list-page-size').value || 20; }

  /** Số trang cần hiện: 1 … (trang hiện tại ±1) … trang cuối. */
  function pageItems(cur, total) {
    var set = [1, total, cur - 1, cur, cur + 1].filter(function (n) { return n >= 1 && n <= total; });
    set = set.filter(function (n, i) { return set.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
    var out = [];
    set.forEach(function (n, i) {
      if (i && n - set[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  /** Ô "Mọi chủ đề": các thẻ có trong cấp HSK đang chọn, chia nhóm Từ loại / Chủ đề, kèm số từ. */
  function renderTagFilter() {
    var count = {};
    vocabInFilter().forEach(function (v) { (v.tags || []).forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
    var byLabel = function (a, b) { return tagLabel(a).localeCompare(tagLabel(b), 'vi'); };
    var opt = function (t) { return '<option value="' + esc(t) + '">' + esc(tagLabel(t)) + ' (' + count[t] + ')</option>'; };
    var tags = Object.keys(count);
    var wordClass = tags.filter(function (t) { return WORD_CLASS_TAGS[t]; }).sort(byLabel);
    var topics = tags.filter(function (t) { return !WORD_CLASS_TAGS[t]; }).sort(byLabel);
    var html = '<option value="">Mọi chủ đề</option>' +
      (topics.length ? '<optgroup label="Chủ đề">' + topics.map(opt).join('') + '</optgroup>' : '') +
      (wordClass.length ? '<optgroup label="Từ loại">' + wordClass.map(opt).join('') + '</optgroup>' : '');
    ['#filter-tag', '#list-tag'].forEach(function (id) {
      var sel = $(id), cur = sel.value;
      sel.innerHTML = html;
      sel.value = count[cur] ? cur : '';   // giữ lựa chọn nếu chủ đề vẫn còn trong cấp mới
    });
  }

  /** Từ của bộ thẻ học: cấp HSK đang chọn + chủ đề ở tab Học. */
  function vocabInStudyFilter() {
    var tag = $('#filter-tag').value;
    return vocabInFilter().filter(function (v) { return !tag || (v.tags || []).indexOf(tag) >= 0; });
  }

  function renderList() {
    var q = $('#list-search').value.trim().toLowerCase();
    // Tìm pinyin không cần dấu thanh / dấu cách: "xuexi" khớp "xuéxí"; chỉ áp dụng khi gõ chữ Latin
    var qPy = /^[a-zA-Zü\s'\-:]+$/.test(q) ? pyKey(q) : '';
    var progress = Store.getAllProgress();
    var statusFilter = $('#list-status').value;
    var tagFilter = $('#list-tag').value;
    var now = Date.now();
    var matched = vocabInFilter().filter(function (v) {
      if (tagFilter && (v.tags || []).indexOf(tagFilter) < 0) return false;
      if (statusFilter) {
        var p = progress[v.id];
        var st = p ? p.status : 'new';
        if (statusFilter === 'due') { if (!Store.isDue(p, now)) return false; }
        else if (st !== statusFilter) return false;
      }
      return !q || v.hanzi.indexOf(q) >= 0 || v.pinyin.toLowerCase().indexOf(q) >= 0 ||
        (qPy && pyKey(v.pinyin).indexOf(qPy) >= 0) || v.meaning_vi.toLowerCase().indexOf(q) >= 0;
    });

    var size = listPageSize();
    var pages = Math.max(1, Math.ceil(matched.length / size));
    listPage = Math.min(Math.max(1, listPage), pages);
    var start = (listPage - 1) * size;

    var rows = matched.slice(start, start + size).map(function (v) {
      var p = progress[v.id];
      var status = p ? p.status : 'new';
      return '<tr class="row-' + status + '">' +
        '<td class="zh">' + esc(v.hanzi) + '</td>' +
        '<td class="py-cell"><span class="peekable" data-peek="pinyin">' + pinyinHtml(v.pinyin) + '</span></td>' +
        '<td><span class="peekable" data-peek="meaning">' + esc(v.meaning_vi) + '</span></td>' +
        '<td class="d-none d-md-table-cell">' + esc(v.hsk_level) + '</td>' +
        '<td>' + STATUS_LABEL[status] + '</td>' +
        '<td class="d-none d-md-table-cell small">' + (p && status !== 'new' ? fmtDate(p.nextReview) : '—') + '</td>' +
        '<td class="text-end text-nowrap">' +
          '<button type="button" class="btn-study" data-id="' + esc(v.id) + '" title="Học từ này" aria-label="Học từ ' + esc(v.hanzi) + '"><i class="bi bi-play-fill"></i></button>' +
        '</td></tr>';
    });
    $('#vocab-table').innerHTML = rows.join('') ||
      '<tr><td colspan="7" class="text-center text-muted-2">Không tìm thấy</td></tr>';

    $('#list-info').textContent = matched.length
      ? (start + 1) + '–' + Math.min(start + size, matched.length) + ' / ' + matched.length + ' từ'
      : '0 từ';

    var li = function (label, page, opts) {
      opts = opts || {};
      return '<li class="page-item' + (opts.disabled ? ' disabled' : '') + (opts.active ? ' active' : '') + '">' +
        (opts.disabled || opts.active
          ? '<span class="page-link"' + (opts.aria ? ' aria-label="' + opts.aria + '"' : '') + '>' + label + '</span>'
          : '<button type="button" class="page-link" data-page="' + page + '"' + (opts.aria ? ' aria-label="' + opts.aria + '"' : '') + '>' + label + '</button>') +
        '</li>';
    };
    $('#list-pager').innerHTML = pages < 2 ? '' :
      li('<i class="bi bi-chevron-left"></i>', listPage - 1, { disabled: listPage === 1, aria: 'Trang trước' }) +
      pageItems(listPage, pages).map(function (n) {
        return n === '…' ? li('…', 0, { disabled: true }) : li(n, n, { active: n === listPage });
      }).join('') +
      li('<i class="bi bi-chevron-right"></i>', listPage + 1, { disabled: listPage === pages, aria: 'Trang sau' });
  }


  function refreshAll() {
    var cur = currentWord();
    renderHskFilter();
    buildDeck(cur && cur.id);
    renderList();
  }

  /* ============================================================
   * Sự kiện
   * ============================================================ */
  // Chúc mừng: chạm câu tiếng Trung để nghe; đóng xong còn thành tích chờ thì hiện tiếp
  on('#cele-cheer', 'click', function () { speak($('#cele-zh').textContent); });
  $('#cele-modal').addEventListener('hidden.bs.modal', function () {
    if (!cele.waiting) return;
    cele.pending = cele.waiting; cele.waiting = null;
    cele.timer = setTimeout(flushCelebrate, 300);
  });

  on('#flashcard', 'click', function (e) {
    if (swipe.justSwiped) return;
    if (e.target.closest('button')) return;
    if (String(window.getSelection())) return;
    setFlipped(!state.flipped);
  });
  on('#btn-flip', 'click', function () { setFlipped(!state.flipped); });
  on('#btn-prev', 'click', function () { go(-1); });
  on('#btn-next', 'click', function () { go(1); });
  on('#btn-speak', 'click', function () { var w = currentWord(); if (w) speak(w.hanzi); });
  on('#btn-speak-write', 'click', function () { var w = currentWord(); if (w) speak(w.hanzi); });

  /* ---------- Vuốt thẻ: trái = Chưa nhớ, phải = Đã thuộc (chạm = lật) ---------- */
  var swipe = { justSwiped: false };
  (function initSwipe() {
    var layer = $('#swipe-layer');
    var pid = null, x0 = 0, y0 = 0, dx = 0, dragging = false, armed = false, passed = false;

    function threshold() { return Math.min(130, layer.offsetWidth * 0.3); }
    function setPos(x) {
      var r = Math.max(-1, Math.min(1, x / threshold()));
      layer.style.transform = x ? 'translateX(' + x + 'px) rotate(' + (x / 16).toFixed(2) + 'deg)' : '';
      layer.style.setProperty('--swipe', r.toFixed(3));
      layer.dataset.dir = r > 0.15 ? 'know' : r < -0.15 ? 'again' : '';
    }
    function reset(animate) {
      if (!animate) layer.classList.add('no-anim');
      setPos(0);
      if (!animate) { void layer.offsetWidth; layer.classList.remove('no-anim'); }
    }

    layer.addEventListener('pointerdown', function (e) {
      // Chỉ vuốt bằng ngón tay / bút; chuột dùng nút bấm và phím tắt
      if (e.pointerType === 'mouse' || pid !== null) return;
      if (e.target.closest('button, .peekable')) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0;
      armed = true; dragging = false; passed = false;
    });
    layer.addEventListener('pointermove', function (e) {
      if (!armed || e.pointerId !== pid) return;
      var mx = e.clientX - x0, my = e.clientY - y0;
      if (!dragging) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        if (Math.abs(my) >= Math.abs(mx)) { armed = false; pid = null; return; }   // cuộn dọc mặt sau
        dragging = true;
        layer.classList.add('dragging');
        try { layer.setPointerCapture(pid); } catch (err) { /* bỏ qua */ }
      }
      dx = mx;
      setPos(dx);
      var over = Math.abs(dx) >= threshold();
      if (over && !passed && navigator.vibrate) navigator.vibrate(12);
      passed = over;
    });
    function finish(e) {
      if (e.pointerId !== pid) return;
      pid = null; armed = false;
      if (!dragging) return;
      dragging = false;
      layer.classList.remove('dragging');
      swipe.justSwiped = true;
      setTimeout(function () { swipe.justSwiped = false; }, 80);
      if (e.type === 'pointerup' && Math.abs(dx) >= threshold() && currentWord()) {
        var dir = dx > 0 ? 1 : -1;
        layer.style.transform = 'translateX(' + dir * (layer.offsetWidth * 1.4) + 'px) rotate(' + dir * 24 + 'deg)';
        setTimeout(function () {
          reset(false);
          rate(dir > 0 ? 'mastered' : 'again');
        }, 220);
      } else {
        reset(true);
      }
    }
    layer.addEventListener('pointerup', finish);
    layer.addEventListener('pointercancel', finish);
  })();

  /* ---------- Ô tập viết: chặn cuộn trang & pull-to-refresh khi ngón tay đang viết ---------- */
  (function lockWriterTouch() {
    var box = $('#writer-box');
    var stop = function (e) { if (e.cancelable) e.preventDefault(); };
    box.addEventListener('touchstart', function (e) {
      document.documentElement.classList.add('is-writing');
      stop(e);
    }, { passive: false });
    box.addEventListener('touchmove', stop, { passive: false });
    ['touchend', 'touchcancel'].forEach(function (ev) {
      box.addEventListener(ev, function () { document.documentElement.classList.remove('is-writing'); });
    });
    box.addEventListener('contextmenu', stop);
  })();

  /* ---------- Chế độ học trên điện thoại: Thẻ ↔ Tập viết ---------- */
  function setMode(mode) {
    $('#study-area').dataset.mode = mode;
    $$('.seg-btn').forEach(function (b) {
      var on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  delegate('.seg', 'click', '.seg-btn', function (e, el) { setMode(el.dataset.mode); });

  /* ---------- Sáng / Tối ---------- */
  function applyTheme(theme) {
    ui.theme = theme;
    document.documentElement.setAttribute('data-bs-theme', theme);
    $('#meta-theme-color').setAttribute('content', theme === 'dark' ? '#0F172A' : '#FAF9F5');
    $('#btn-theme').setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    $('#set-dark').checked = theme === 'dark';
    if (state.chars.length) loadWriterChar();      // vẽ lại ô viết theo màu mới
  }
  on('#btn-theme', 'click', function () {
    ui.themeSaved = true;
    applyTheme(ui.theme === 'dark' ? 'light' : 'dark');
    saveUi();
  });
  // Điện thoại: công tắc trong Cài đặt thay cho nút trên thanh trên cùng
  on('#set-dark', 'change', function () {
    ui.themeSaved = true;
    applyTheme(this.checked ? 'dark' : 'light');
    saveUi();
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!ui.themeSaved) applyTheme(e.matches ? 'dark' : 'light');   // theo hệ điều hành nếu chưa tự chọn
    });
  }

  /* ---------- Ẩn/hiện nhanh Pinyin & nghĩa (tự kiểm tra mặt chữ) ---------- */
  function renderPeekToggles() {
    var root = document.documentElement;
    root.classList.toggle('hide-pinyin', !ui.pinyin);
    root.classList.toggle('hide-meaning', !ui.meaning);
    root.classList.toggle('tone-on', ui.tone);
    [['#tg-pinyin', ui.pinyin], ['#tg-meaning', ui.meaning]].forEach(function (p) {
      var b = $(p[0]);
      b.setAttribute('aria-pressed', p[1] ? 'true' : 'false');
      b.querySelector('i').className = 'bi ' + (p[1] ? 'bi-eye' : 'bi-eye-slash');
    });
    $$('.peek').forEach(function (el) { el.classList.remove('peek'); });
  }
  function togglePeek(key) { ui[key] = !ui[key]; saveUi(); renderPeekToggles(); }
  on('#tg-pinyin', 'click', function () { togglePeek('pinyin'); });
  on('#tg-meaning', 'click', function () { togglePeek('meaning'); });
  // Đang ẩn: chạm vào dòng bị làm mờ để xem riêng dòng đó (không lật thẻ, không phát âm)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.peekable');
    if (!el || el.classList.contains('peek')) return;
    var hidden = el.dataset.peek === 'pinyin' ? !ui.pinyin : !ui.meaning;
    if (!hidden) return;
    e.stopPropagation();
    e.preventDefault();
    el.classList.add('peek');
  }, true);
  renderPeekToggles();
  delegate('#back-related', 'click', '.related-row', function (e, el) {
    e.stopPropagation();
    speak(el.dataset.zh);
  });
  delegate('#back-examples', 'click', '.btn-speak-ex', function (e, el) {
    e.stopPropagation();
    var w = currentWord(); if (w) speak(w.examples[+el.dataset.ex].zh);
  });
  $$('.btn-rate').forEach(function (b) {
    b.addEventListener('click', function () { rate(b.dataset.r); });
  });

  /* ---------- Điện thoại: tiến độ trong popup, mở/đóng bằng nút Tiến độ ---------- */
  function setDashOpen(open) {
    $('#progress-dash').classList.toggle('is-open', open);
    $('#dash-backdrop').classList.toggle('is-open', open);
    $('#btn-dash').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  on('#btn-dash', 'click', function () { setDashOpen(!$('#progress-dash').classList.contains('is-open')); });
  on('#dash-backdrop', 'click', function () { setDashOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#progress-dash').classList.contains('is-open')) setDashOpen(false);
  });
  document.addEventListener('shown.bs.tab', function () { setDashOpen(false); });

  // Ôn tập từ cần nhớ: đang học hoặc tới hạn ôn
  on('#btn-review-due', 'click', function () {
    setDashOpen(false);
    $('#filter-mode').value = 'due';
    buildDeck();
  });

  // Tiến độ thay đổi (chấm điểm, tập viết, đổi mục tiêu, reset, tab khác) → cập nhật tổng quan
  window.addEventListener('progresschange', function () {
    renderDashboard();
    if (state.deck.length) { renderDeckStats(); renderReviewInfo(); }
  });
  // Vừa nhận tiến độ từ thiết bị khác (js/sync.js) → vẽ lại bộ lọc cấp, bộ thẻ, danh sách
  window.addEventListener('cloudsync', function () {
    lastUnlocked = unlockedCount();
    refreshAll();
  });
  // Đăng nhập / đăng xuất / đổi tài khoản → kiểm tra lại quyền quản trị
  window.addEventListener('authchange', checkAdmin);
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('hoctq.') !== 0) return;
    location.reload();   // tab khác vừa đổi tiến độ → đồng bộ lại
  });

  // Cài đặt: mục tiêu ngày
  on('#settings-modal', 'show.bs.modal', function () {
    var d = Store.getDaily(), s = Store.summary(), st = Store.getSettings();
    $('#goal-input').value = d.dailyGoal;
    $('#set-tone').checked = ui.tone;
    $('#set-dark').checked = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    $('#start-level').innerHTML = availableLevels().map(function (l, i) {
      return '<option value="' + (i + 1) + '">' + (i ? 'Bắt đầu từ ' : 'Từ đầu: ') + esc(l.label) + '</option>';
    }).join('');
    $('#start-level').value = String(Math.min(st.startLevel, availableLevels().length));
    $('#settings-summary').innerHTML = '<i class="bi bi-info-circle"></i> Hiện có ' + s.mastered + ' từ đã thuộc, ' +
      s.learning + ' từ đang học, chuỗi ' + d.streakCount + ' ngày.';
  });
  on('#btn-save-goal', 'click', function () {
    var st = Store.getSettings(), start = +$('#start-level').value || 1;
    var opened = start > Math.max(st.unlocked, st.startLevel);
    st.startLevel = start;
    st.unlocked = Math.max(st.unlocked, start);
    Store.saveSettings(st, true);
    var g = Store.setDailyGoal($('#goal-input').value);
    bootstrap.Modal.getOrCreateInstance($('#settings-modal')).hide();
    lastUnlocked = unlockedCount();
    renderHskFilter();
    if (opened) {   // chuyển sang cấp vừa chọn làm điểm bắt đầu
      $('#filter-hsk').value = String(availableLevels()[start - 1].level);
      try { localStorage.setItem(KEY_HSK, $('#filter-hsk').value); } catch (e) { /* bỏ qua */ }
      buildDeck();
    }
    toast('Đã lưu: mục tiêu ' + g + ' từ/ngày' + (opened ? ', mở khóa đến ' + esc(availableLevels()[start - 1].label) : '') + '.');
  });
  on('#goal-input', 'keydown', function (e) { if (e.key === 'Enter') $('#btn-save-goal').click(); });
  // Tô màu thanh điệu: áp dụng ngay khi gạt công tắc
  on('#set-tone', 'change', function () { ui.tone = this.checked; saveUi(); renderPeekToggles(); });

  // Đặt lại tiến độ: luôn qua hộp xác nhận
  on('#btn-open-reset', 'click', function () {
    bootstrap.Modal.getOrCreateInstance($('#settings-modal')).hide();
    bootstrap.Modal.getOrCreateInstance($('#reset-modal')).show();
  });
  on('#btn-confirm-reset', 'click', function () {
    Store.resetAll();
    bootstrap.Modal.getOrCreateInstance($('#reset-modal')).hide();
    $('#filter-mode').value = 'new';
    // Bắt đầu lại từ thẻ đầu tiên (không giữ vị trí thẻ đang xem như refreshAll)
    listPage = 1;
    renderHskFilter();
    buildDeck();
    toast('Đã xóa toàn bộ tiến độ học tập.');
  });

  on('#filter-mode', 'change', function () { buildDeck(); });
  on('#filter-tag', 'change', function () { fillDeck(); });
  on('#filter-hsk', 'change', function () {
    try { localStorage.setItem(KEY_HSK, this.value); } catch (e) { /* bỏ qua */ }
    listPage = 1;
    buildDeck();
  });
  on('#btn-shuffle', 'click', function () {
    for (var i = state.deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = state.deck[i]; state.deck[i] = state.deck[j]; state.deck[j] = tmp;
    }
    state.index = 0;
    renderCard();
  });

  delegate('#char-tabs', 'click', '.char-tab', function (e, el) { selectChar(+el.dataset.i); });
  on('#btn-quiz', 'click', startQuiz);
  on('#btn-animate', 'click', animate);
  on('#btn-outline', 'click', function () {
    state.outline = !state.outline;
    this.setAttribute('aria-pressed', state.outline ? 'true' : 'false');
    this.querySelector('i').className = 'bi ' + (state.outline ? 'bi-eye' : 'bi-eye-slash');
    if (state.writer) { if (state.outline) state.writer.showOutline(); else state.writer.hideOutline(); }
  });

  // Phím tắt (chỉ khi đang ở tab Học và không gõ trong ô nhập)
  document.addEventListener('keydown', function (e) {
    if (!$('#tab-study').classList.contains('active')) return;
    if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    var w;
    switch (e.key) {
      case ' ': case 'Enter': e.preventDefault(); setFlipped(!state.flipped); break;
      case 'ArrowLeft': e.preventDefault(); go(-1); break;
      case 'ArrowRight': e.preventDefault(); go(1); break;
      case 'r': case 'R': w = currentWord(); if (w) speak(w.hanzi); break;
      case '1': rate('again'); break;
      case '2': rate('good'); break;
      case '3': rate('mastered'); break;
      case 'p': case 'P': togglePeek('pinyin'); break;
      case 'm': case 'M': togglePeek('meaning'); break;
    }
  });

  // Đổi kích thước ô viết khi xoay màn hình / resize qua mốc mobile
  var lastSize = padSize();
  window.addEventListener('resize', function () {
    var s = padSize();
    if (s !== lastSize) { lastSize = s; if (state.chars.length) loadWriterChar(); }
  });

  // Danh sách
  on('#list-search', 'input', function () { listPage = 1; renderList(); });
  on('#list-page-size', 'change', function () { listPage = 1; renderList(); });
  on('#list-status', 'change', function () { listPage = 1; renderList(); });
  on('#list-tag', 'change', function () { listPage = 1; renderList(); });
  delegate('#list-pager', 'click', '[data-page]', function (e, el) {
    listPage = +el.dataset.page;
    renderList();
    $('#tab-list').scrollIntoView({ block: 'start' });
  });
  delegate('#vocab-table', 'click', '.btn-study', function (e, el) {
    $('#filter-mode').value = 'all';
    buildDeck(el.dataset.id);
    bootstrap.Tab.getOrCreateInstance($('[data-bs-target="#tab-study"]')).show();
  });

  /* ============================================================
   * Khởi động
   * ============================================================ */
  if (!availableLevels().length) {
    $('#deck-stats').textContent = '';
    $('#empty-deck').classList.remove('d-none');
    $('#empty-deck').innerHTML = 'Chưa có dữ liệu. Thêm file <code>data/hsk1.csv</code> rồi chạy <b>cap-nhat-du-lieu.bat</b>.';
    $('#study-area').classList.add('d-none');
    return;
  }
  renderHskFilter();
  renderDashboard();
  buildDeck();
  checkAdmin();
});
