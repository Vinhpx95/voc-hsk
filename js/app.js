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

  function toast(msg) {
    $('#toast-body').innerHTML = msg;
    bootstrap.Toast.getOrCreateInstance($('#app-toast'), { delay: 2500 }).show();
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
    basic: { label: 'Câu đơn giản', cls: 'text-bg-success' },
    simple: { label: 'Câu đơn', cls: 'text-bg-info' },
    compound: { label: 'Câu ghép', cls: 'text-bg-primary' }
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
  var zhVoice = null;
  function pickVoice() {
    var voices = window.speechSynthesis.getVoices();
    zhVoice = voices.find(function (v) { return /zh[-_]CN/i.test(v.lang); }) ||
              voices.find(function (v) { return /^zh/i.test(v.lang); }) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  var warnedNoVoice = false;
  function speak(text) {
    if (!text) return;
    if (!('speechSynthesis' in window)) { toast('Trình duyệt không hỗ trợ phát âm.'); return; }
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

  /** Số cấp đang mở (tính từ đầu danh sách levels.js); lưu lại khi mở thêm cấp mới */
  function unlockedCount(summary) {
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
      '<span class="text-secondary">' + fresh + ' mới</span> · ' +
      '<span class="txt-learning">' + learning + ' đang học</span> · ' +
      '<span class="txt-mastered">' + mastered + ' đã thuộc</span>' +
      (due ? ' · <span class="text-danger">' + due + ' cần ôn</span>' : '');
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

    // Lộ trình: báo khi vừa mở cấp mới, và nhắc còn bao nhiêu từ để mở cấp tiếp theo
    var levels = availableLevels(), open = unlockedCount(s);
    if (lastUnlocked !== null && open > lastUnlocked) {
      toast('🔓 Đã mở khóa <b>' + esc(levels[open - 1].label) + '</b>! Bạn có thể bắt đầu học cấp mới.');
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
    $('#study-area').classList.toggle('d-none', !w);
    if (!w) { destroyWriter(); return; }

    setFlipped(false);
    var front = $('#card-hanzi');
    front.textContent = w.hanzi;
    front.style.fontSize = w.hanzi.length > 3 ? 'clamp(2.5rem, 9vw, 4.5rem)' : '';
    $('#card-hsk').textContent = 'HSK ' + w.hsk_level;
    $('#card-pos').textContent = (state.index + 1) + ' / ' + state.deck.length;

    $('#back-hanzi').textContent = w.hanzi;
    $('#back-trad').textContent = w.traditional && w.traditional !== w.hanzi ? '(' + w.traditional + ')' : '';
    $('#back-pinyin').textContent = w.pinyin;
    $('#back-meaning').textContent = w.meaning_vi;
    renderImage($('#back-image'), w.image);
    $('#back-tags').innerHTML = (w.tags || []).map(function (t) {
      return '<span class="badge rounded-pill text-bg-light border me-1">' + esc(tagLabel(t)) + '</span>';
    }).join('');
    $('#back-explain').textContent = w.explanation || '';
    var related = w.related || [];
    $('#back-related').innerHTML = !related.length ? '' :
      '<div class="section-box">' +
        '<div class="section-title"><i class="bi bi-book"></i> Từ vựng liên quan</div>' +
        '<div class="related-grid">' + related.map(function (r) {
          return '<button type="button" class="related-row" data-zh="' + esc(r.hanzi) + '" title="Chạm để nghe">' +
            '<span class="rel-zh zh">' + esc(r.hanzi) + '</span>' +
            '<span class="rel-py">/' + esc(r.pinyin) + '/</span>' +
            '<span class="rel-colon">:</span>' +
            '<span class="rel-vi">' + esc(r.vi) + '</span></button>';
        }).join('') + '</div>' +
      '</div>';
    $('#back-examples').innerHTML = !(w.examples || []).length ? '' :
      '<div class="section-title mt-2"><i class="bi bi-chat-quote"></i> Ví dụ</div>' +
      w.examples.map(function (ex, i) {
      var t = EXAMPLE_TYPE[ex.type];
      return '<div class="example">' +
        (t ? '<span class="badge ex-type ' + t.cls + '">' + t.label + '</span>' : '') +
        '<div class="ex-zh zh">' + esc(ex.zh) +
        ' <button class="btn btn-link btn-sm btn-speak-ex" data-ex="' + i + '" title="Nghe câu"><i class="bi bi-volume-up"></i></button></div>' +
        '<div class="ex-py">' + esc(ex.pinyin) + '</div>' +
        '<div class="ex-vi">' + esc(ex.vi) + '</div></div>';
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
        : ' · <span class="text-success">' + p.correctCount + ' đúng</span> · <span class="text-danger">' + p.wrongCount + ' sai</span>' +
          ' · Ôn lại ' + fromNow(p.nextReview));
    // Gợi ý khoảng ôn cho nút "Tạm nhớ" theo số lần đúng liên tiếp
    var next = p.streak + 1;
    $('#rate-good-hint').textContent = next >= 3 ? 'thuộc · ôn sau 7 ngày' : 'ôn lại sau ' + (next === 1 ? 1 : 3) + ' ngày';
  }

  function setFlipped(v) {
    state.flipped = v;
    $('#flashcard').classList.toggle('flipped', v);
  }

  function go(delta) {
    if (!state.deck.length) return;
    state.index = (state.index + delta + state.deck.length) % state.deck.length;
    renderCard();
  }

  var RATE_TEXT = { again: 'Chưa nhớ', good: 'Tạm nhớ', mastered: 'Đã thuộc' };
  function rate(kind) {
    var w = currentWord(); if (!w || !RATE_TEXT[kind]) return;
    var res = Store.rate(w.id, kind, w.set);
    toast(res.goalReached
      ? '🎉 Hoàn thành mục tiêu hôm nay! Tiếp tục giữ chuỗi ngày học nhé.'
      : RATE_TEXT[kind] + ' · ôn lại ' + fromNow(res.progress.nextReview));
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
  function padSize() { return window.innerWidth < 576 ? 260 : 300; }

  function gridSvg(size) {
    var s = size, h = s / 2;
    var dash = 'stroke="#e3b4a8" stroke-width="1" stroke-dasharray="6,5"';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" id="writer-svg">' +
      '<rect x="1" y="1" width="' + (s - 2) + '" height="' + (s - 2) + '" fill="none" stroke="#d9381e" stroke-width="2"/>' +
      '<line x1="0" y1="' + h + '" x2="' + s + '" y2="' + h + '" ' + dash + '/>' +
      '<line x1="' + h + '" y1="0" x2="' + h + '" y2="' + s + '" ' + dash + '/>' +
      '<line x1="0" y1="0" x2="' + s + '" y2="' + s + '" ' + dash + '/>' +
      '<line x1="' + s + '" y1="0" x2="0" y2="' + s + '" ' + dash + '/>' +
      '</svg>';
  }

  function renderCharTabs() {
    $('#char-tabs').innerHTML = state.chars.length < 2 ? '' : state.chars.map(function (c, i) {
      return '<li class="nav-item"><button class="nav-link' + (i === state.charIndex ? ' active' : '') +
        '" data-i="' + i + '">' + esc(c) + '</button></li>';
    }).join('');
  }

  function destroyWriter() {
    if (state.writer) { try { state.writer.cancelQuiz(); } catch (e) { /* bỏ qua */ } }
    state.writer = null;
    $('#writer-box').innerHTML = '';
  }

  function setStatus(html, cls) {
    var el = $('#writer-status');
    el.className = 'mt-2 small ' + (cls || '');
    el.innerHTML = html || '&nbsp;';
  }

  function loadWriterChar() {
    destroyWriter();
    var ch = state.chars[state.charIndex];
    if (!ch) { setStatus('Từ này không có ký tự Hán hợp lệ để tập viết.', 'text-danger'); return; }

    var size = padSize();
    var box = $('#writer-box');
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    box.innerHTML = gridSvg(size);
    setStatus('<span class="spinner-border spinner-border-sm"></span> Đang tải nét chữ…', 'text-body-secondary');

    var token = {};
    state.loadToken = token;

    state.writer = HanziWriter.create(document.getElementById('writer-svg'), ch, {
      width: size,
      height: size,
      padding: 14,
      showOutline: state.outline,
      showCharacter: false,
      strokeColor: '#222222',
      radicalColor: '#d9381e',
      outlineColor: '#e8e2d6',
      highlightColor: '#3d8bfd',
      drawingColor: '#333333',
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
        setStatus('Không tải được dữ liệu nét chữ (kiểm tra kết nối mạng).', 'text-danger');
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
    setStatus('Viết nét đầu tiên theo đúng thứ tự…', 'text-body-secondary');

    w.quiz({
      onMistake: function (sd) {
        if (navigator.vibrate) navigator.vibrate(50);
        shakePad();
        if (sd.mistakesOnStroke >= 3) {
          w.highlightStroke(sd.strokeNum);
          setStatus('Gợi ý: theo nét đang nháy sáng (nét ' + (sd.strokeNum + 1) + ')', 'text-primary');
        } else {
          setStatus('Chưa đúng nét ' + (sd.strokeNum + 1) + ' — sai hướng hoặc sai thứ tự (' + sd.mistakesOnStroke + '/3)', 'text-danger');
        }
      },
      onCorrectStroke: function (sd) {
        setStatus('Đúng! Còn ' + sd.strokesRemaining + ' nét', 'text-success');
      },
      onComplete: function (summary) {
        var word = currentWord();
        if (word && Store.recordWriting(word.id, ch, summary.totalMistakes, word.set).goalReached) {
          toast('🎉 Hoàn thành mục tiêu hôm nay!');
        }
        renderWritingStats();
        var msg = summary.totalMistakes === 0
          ? '🎉 Hoàn hảo! Không sai nét nào.'
          : 'Hoàn thành với ' + summary.totalMistakes + ' nét sai.';
        var hasNext = state.charIndex < state.chars.length - 1;
        setStatus(msg + (hasNext ? ' Chuyển sang chữ tiếp theo…' : ''), summary.totalMistakes ? 'text-warning-emphasis' : 'text-success');
        if (hasNext) setTimeout(function () { selectChar(state.charIndex + 1); }, 1200);
      }
    });
  }

  function animate() {
    var w = state.writer; if (!w) return;
    w.cancelQuiz();
    setStatus('Đang vẽ mẫu thứ tự nét…', 'text-body-secondary');
    w.hideCharacter();
    w.animateCharacter({
      onComplete: function () { setStatus('Xong. Nhấn <b>Tập viết</b> để tự viết.', 'text-body-secondary'); }
    });
  }

  function selectChar(i) {
    state.charIndex = i;
    $$('#char-tabs .nav-link').forEach(function (b) { b.classList.toggle('active', +b.dataset.i === i); });
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
        '<td>' + esc(v.pinyin) + '</td>' +
        '<td>' + esc(v.meaning_vi) + '</td>' +
        '<td class="d-none d-md-table-cell">' + esc(v.hsk_level) + '</td>' +
        '<td>' + STATUS_LABEL[status] + '</td>' +
        '<td class="d-none d-md-table-cell small">' + (p && status !== 'new' ? fmtDate(p.nextReview) : '—') + '</td>' +
        '<td class="text-end text-nowrap">' +
          '<button class="btn btn-sm btn-outline-primary btn-study" data-id="' + esc(v.id) + '" title="Học từ này"><i class="bi bi-play"></i></button>' +
        '</td></tr>';
    });
    $('#vocab-table').innerHTML = rows.join('') ||
      '<tr><td colspan="7" class="text-center text-body-secondary">Không tìm thấy</td></tr>';

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
  on('#flashcard', 'click', function (e) {
    if (e.target.closest('button')) return;
    if (String(window.getSelection())) return;
    setFlipped(!state.flipped);
  });
  on('#btn-flip', 'click', function () { setFlipped(!state.flipped); });
  on('#btn-prev', 'click', function () { go(-1); });
  on('#btn-next', 'click', function () { go(1); });
  on('#btn-speak', 'click', function () { var w = currentWord(); if (w) speak(w.hanzi); });
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

  // Ôn tập từ cần nhớ: đang học hoặc tới hạn ôn
  on('#btn-review-due', 'click', function () {
    $('#filter-mode').value = 'due';
    buildDeck();
  });

  // Tiến độ thay đổi (chấm điểm, tập viết, đổi mục tiêu, reset, tab khác) → cập nhật tổng quan
  window.addEventListener('progresschange', function () {
    renderDashboard();
    if (state.deck.length) { renderDeckStats(); renderReviewInfo(); }
  });
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('hoctq.') !== 0) return;
    location.reload();   // tab khác vừa đổi tiến độ → đồng bộ lại
  });

  // Cài đặt: mục tiêu ngày
  on('#settings-modal', 'show.bs.modal', function () {
    var d = Store.getDaily(), s = Store.summary(), st = Store.getSettings();
    $('#goal-input').value = d.dailyGoal;
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

  // Đặt lại tiến độ: luôn qua hộp xác nhận
  on('#btn-open-reset', 'click', function () {
    bootstrap.Modal.getOrCreateInstance($('#settings-modal')).hide();
    bootstrap.Modal.getOrCreateInstance($('#reset-modal')).show();
  });
  on('#btn-confirm-reset', 'click', function () {
    Store.resetAll();
    bootstrap.Modal.getOrCreateInstance($('#reset-modal')).hide();
    $('#filter-mode').value = 'all';
    refreshAll();
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

  delegate('#char-tabs', 'click', '.nav-link', function (e, el) { selectChar(+el.dataset.i); });
  on('#btn-quiz', 'click', startQuiz);
  on('#btn-animate', 'click', animate);
  on('#btn-outline', 'click', function () {
    state.outline = !state.outline;
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
});
