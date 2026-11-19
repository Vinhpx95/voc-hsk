/*
 * Lưu trữ cục bộ (Local-First, không cần tài khoản):
 *   - wordProgress : tiến độ từng từ (SRS cơ bản) — key hoctq.progress
 *   - dailyStats   : số từ học hôm nay, mục tiêu ngày, chuỗi ngày học — key hoctq.daily
 *   - settings     : lộ trình mở khóa cấp (cấp bắt đầu, số cấp đã mở) — key hoctq.settings
 *   - cache nét chữ (Hanzi Writer)                  — key hoctq.stroke.<chữ>
 * Mọi thao tác localStorage đều bọc try/catch (chế độ riêng tư / bị chặn vẫn chạy được).
 * Mỗi lần dữ liệu thay đổi sẽ phát sự kiện window 'progresschange' để giao diện tự cập nhật.
 */
(function () {
  var KEY_PROGRESS = 'hoctq.progress';
  var KEY_DAILY = 'hoctq.daily';
  var KEY_SETTINGS = 'hoctq.settings';
  var KEY_STROKE = 'hoctq.stroke.';
  var MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  var DEFAULT_GOAL = 20;

  /* ---------- localStorage an toàn ---------- */
  var memory = {};                 // dự phòng khi localStorage không dùng được
  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return key in memory ? memory[key] : fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { memory[key] = value; return false; }
  }
  function removeKey(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
    delete memory[key];
  }
  function emit() {
    try { window.dispatchEvent(new CustomEvent('progresschange')); } catch (e) { /* trình duyệt cũ */ }
  }

  /* ---------- Ngày theo giờ địa phương (YYYY-MM-DD) ---------- */
  function dayKey(t) {
    var d = new Date(t == null ? Date.now() : t);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayKey() { return dayKey(Date.now() - DAY); }

  /* ---------- wordProgress ---------- */
  function newRecord() {
    return {
      status: 'new',          // 'new' | 'learning' | 'mastered'
      correctCount: 0,        // tổng số lần trả lời đúng
      wrongCount: 0,          // tổng số lần trả lời sai
      lastReviewed: 0,        // timestamp lần học gần nhất
      nextReview: 0,          // timestamp gợi ý ôn tiếp
      streak: 0,              // số lần đúng liên tiếp (dùng tính khoảng ôn)
      set: '',                // bộ dữ liệu (cấp HSK) chứa từ — để tính tiến độ từng cấp
      writing: {}             // thống kê tập viết theo từng chữ
    };
  }

  /** Chuyển bản ghi kiểu cũ (SM-2: flashcard_status, next_review_at…) sang cấu trúc mới */
  function migrate(old) {
    if (!old || old.status) return old;
    var r = newRecord();
    r.status = old.flashcard_status || 'new';
    r.nextReview = old.next_review_at || 0;
    r.streak = old.repetitions || 0;
    r.correctCount = old.repetitions || 0;
    r.writing = old.writing_stats || {};
    return r;
  }

  var cache = null;
  function all() {
    if (cache) return cache;
    var data = readJSON(KEY_PROGRESS, {}) || {};
    var changed = false;
    Object.keys(data).forEach(function (id) {
      if (data[id] && !data[id].status) { data[id] = migrate(data[id]); changed = true; }
    });
    if (changed) writeJSON(KEY_PROGRESS, data);
    cache = data;
    return cache;
  }
  function persist() { writeJSON(KEY_PROGRESS, all()); emit(); }

  /* ---------- dailyStats ---------- */
  function daily() {
    var d = readJSON(KEY_DAILY, null) || {};
    var today = dayKey();
    var out = {
      date: today,
      todayCount: d.date === today ? (d.todayCount || 0) : 0,
      todayIds: d.date === today ? (d.todayIds || []) : [],
      dailyGoal: d.dailyGoal > 0 ? d.dailyGoal : DEFAULT_GOAL,
      streakCount: d.streakCount || 0,
      lastStudyDate: d.lastStudyDate || ''
    };
    // Chuỗi chỉ còn hiệu lực nếu hôm nay hoặc hôm qua có học
    if (out.lastStudyDate !== today && out.lastStudyDate !== yesterdayKey()) out.streakCount = 0;
    return out;
  }

  /** Ghi nhận đã học/ôn một từ hôm nay; cập nhật chuỗi ngày. Trả về true nếu vừa đạt mục tiêu. */
  function recordStudy(id) {
    var d = daily(), today = dayKey();
    var before = d.todayCount;
    if (d.todayIds.indexOf(id) < 0) { d.todayIds.push(id); d.todayCount = d.todayIds.length; }
    if (d.lastStudyDate !== today) {
      d.streakCount = d.lastStudyDate === yesterdayKey() ? d.streakCount + 1 : 1;
      d.lastStudyDate = today;
    }
    writeJSON(KEY_DAILY, d);
    return before < d.dailyGoal && d.todayCount >= d.dailyGoal;
  }

  var Store = {
    /* ---------- Từ vựng: các cấp đã tải từ js/data/hskN.js ---------- */
    getAllVocab: function () {
      var data = window.HSK_DATA || {};
      // Theo thứ tự trong js/data/levels.js (HSK 1 … 6, rồi HSK 7-9 phần 1, 2 …)
      return (window.HSK_LEVELS || []).reduce(function (list, l) { return list.concat(data[l.level] || []); }, []);
    },

    /* ---------- Tiến độ từng từ ---------- */
    getAllProgress: function () { return all(); },
    getProgress: function (id) { return all()[id] || newRecord(); },
    statusOf: function (id) { var p = all()[id]; return p ? p.status : 'new'; },

    /** Từ cần ôn: đang học, hoặc đã học và tới hạn nextReview */
    isDue: function (p, now) {
      if (!p || p.status === 'new') return false;
      return p.status === 'learning' || p.nextReview <= (now || Date.now());
    },

    /**
     * Chấm điểm một lượt học (SRS cơ bản):
     *   'again'    Chưa nhớ / Lặp lại → learning, ôn lại sau 10 phút
     *   'good'     Tạm nhớ  → đúng lần 1: sau 1 ngày; lần 2: sau 3 ngày; ≥3 lần liên tiếp: mastered, sau 7 ngày
     *   'mastered' Đã thuộc → mastered ngay, ôn lại sau 7 ngày
     * Trả về { progress, goalReached }.
     */
    rate: function (id, rating, setKey) {
      var map = all(), p = map[id] || newRecord(), now = Date.now();
      if (rating === 'again') {
        p.wrongCount += 1;
        p.streak = 0;
        p.status = 'learning';
        p.nextReview = now + 10 * MIN;
      } else {
        p.correctCount += 1;
        p.streak = rating === 'mastered' ? Math.max(p.streak + 1, 3) : p.streak + 1;
        if (p.streak >= 3) { p.status = 'mastered'; p.nextReview = now + 7 * DAY; }
        else { p.status = 'learning'; p.nextReview = now + (p.streak === 1 ? 1 : 3) * DAY; }
      }
      p.lastReviewed = now;
      if (setKey) p.set = setKey;
      map[id] = p;
      var goalReached = recordStudy(id);
      persist();
      return { progress: p, goalReached: goalReached };
    },

    recordWriting: function (id, ch, mistakes, setKey) {
      var map = all(), p = map[id] || newRecord();
      var s = p.writing[ch] || { attempts: 0, total_mistakes: 0, last_practiced: 0 };
      s.attempts += 1;
      s.total_mistakes += mistakes;
      s.last_practiced = Date.now();
      p.writing[ch] = s;
      if (setKey && !p.set) p.set = setKey;
      map[id] = p;
      var goalReached = recordStudy(id);
      persist();
      return { stats: s, goalReached: goalReached };
    },

    /** Gắn cấp (bộ dữ liệu) cho các bản ghi cũ chưa có, khi cấp đó vừa được tải */
    backfillSet: function (setKey, words) {
      var map = all(), changed = false;
      words.forEach(function (w) { var p = map[w.id]; if (p && p.set !== setKey) { p.set = setKey; changed = true; } });
      if (changed) writeJSON(KEY_PROGRESS, map);
    },

    /** Đếm trạng thái: toàn bộ, hoặc theo từng cấp { set: {learning, mastered} } */
    summary: function () {
      var map = all(), now = Date.now();
      var out = { mastered: 0, learning: 0, due: 0, bySet: {} };
      Object.keys(map).forEach(function (id) {
        var p = map[id]; if (!p || p.status === 'new') return;
        out[p.status] += 1;
        if (Store.isDue(p, now)) out.due += 1;
        if (p.set) {
          var b = out.bySet[p.set] = out.bySet[p.set] || { learning: 0, mastered: 0 };
          b[p.status] += 1;
        }
      });
      return out;
    },

    /* ---------- Thống kê ngày ---------- */
    getDaily: daily,
    setDailyGoal: function (n) {
      var d = daily();
      d.dailyGoal = Math.max(1, Math.min(500, Math.round(+n) || DEFAULT_GOAL));
      writeJSON(KEY_DAILY, d);
      emit();
      return d.dailyGoal;
    },

    /* ---------- Lộ trình mở khóa cấp ----------
     * startLevel : số cấp người học tự mở khi đã có nền tảng (1 = bắt đầu từ cấp đầu tiên)
     * unlocked   : số cấp đã mở (chỉ tăng, không tự khóa lại)
     */
    getSettings: function () {
      var s = readJSON(KEY_SETTINGS, null) || {};
      return { startLevel: s.startLevel > 0 ? s.startLevel : 1, unlocked: s.unlocked > 0 ? s.unlocked : 1 };
    },
    saveSettings: function (s, silent) { writeJSON(KEY_SETTINGS, s); if (!silent) emit(); },

    /** Đặt lại toàn bộ tiến độ học + chuỗi ngày + mục tiêu + lộ trình (giữ cache nét chữ) */
    resetAll: function () {
      removeKey(KEY_PROGRESS);
      removeKey(KEY_DAILY);
      removeKey(KEY_SETTINGS);
      cache = null;
      emit();
    },

    /* ---------- Cache nét chữ (để học offline sau lần tải đầu) ---------- */
    getStroke: function (ch) { return readJSON(KEY_STROKE + ch, null); },
    saveStroke: function (ch, data) { writeJSON(KEY_STROKE + ch, data); },

    dayKey: dayKey
  };

  window.Store = Store;
})();
