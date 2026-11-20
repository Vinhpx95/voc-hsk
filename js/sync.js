/*
 * Đăng nhập Google + đồng bộ tiến độ học qua Firebase (Auth + Firestore).
 *
 * Nguyên tắc: Local-First. Ứng dụng luôn đọc/ghi localStorage (js/storage.js); mô-đun này
 *   - khi đăng nhập / mở lại trang / quay lại tab: tải bản trên đám mây, GỘP với bản trên máy rồi ghi lại;
 *   - khi dữ liệu trên máy đổi: gom 2 giây rồi chỉ gửi những từ đã thay đổi.
 *
 * Firestore:
 *   users/{uid}                 { name, email, daily, settings, resetAt, updatedAt }
 *   users/{uid}/progress/{cấp}  { words: { <id từ>: "<bản ghi tiến độ dạng JSON>" } }
 *     — chia theo cấp HSK để mỗi tài liệu < 1 MB; mỗi từ là một chuỗi để không vượt giới hạn 20.000 trường/tài liệu
 *
 * Trạng thái trên máy (localStorage 'hoctq-sync', không có dấu chấm để không kích hoạt tải lại giữa các tab):
 *   { mode: 'user' | 'guest' | '', uid, name, email, photo, resetAt, syncedAt }
 *
 * Phát sự kiện window:
 *   'authchange' — đổi trạng thái đăng nhập / đồng bộ (detail = Cloud.info())
 *   'cloudsync'  — dữ liệu trên máy vừa được cập nhật từ đám mây (giao diện cần vẽ lại)
 */
(function () {
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var KEY_META = 'hoctq-sync';
  var PUSH_DELAY = 2000;
  var PULL_MIN_GAP = 20 * 1000;

  var cfg = window.FIREBASE_CONFIG || {};
  var configured = !!(cfg.apiKey && cfg.projectId);
  var isFile = location.protocol === 'file:';
  // Trình duyệt nhúng trong ứng dụng: Google chặn đăng nhập ở đây (lỗi disallowed_useragent)
  var inApp = /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent);

  /* ---------- Trạng thái trên máy ---------- */
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(KEY_META)) || {}; } catch (e) { return {}; }
  }
  function saveMeta() {
    try { localStorage.setItem(KEY_META, JSON.stringify(meta)); } catch (e) { /* bỏ qua */ }
  }
  var meta = readMeta();

  var auth = null, db = null, user = null;
  var status = 'idle';          // idle | loading | syncing | pending | synced | offline | error
  var authResolved = false;     // Firebase đã khôi phục xong phiên đăng nhập
  var lastPull = 0;
  var known = { words: {}, daily: null, settings: null };   // bản trên đám mây mà máy này đã biết (chuỗi JSON)

  function fire(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* trình duyệt cũ */ }
  }
  function setStatus(s) { status = s; fire('authchange', Cloud.info()); }

  /* ---------- JSON ổn định (khóa sắp xếp) để so sánh bản ghi ---------- */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }

  /* ============================================================
   * Gộp dữ liệu giữa hai thiết bị
   * ============================================================ */
  function recTime(r) {
    var t = r.lastReviewed || 0;
    Object.keys(r.writing || {}).forEach(function (ch) { t = Math.max(t, r.writing[ch].last_practiced || 0); });
    return t;
  }
  /** Một từ: lấy kết quả chấm điểm mới hơn; thống kê tập viết gộp theo từng chữ */
  function mergeRecord(a, b) {
    if (!a) return b;
    if (!b) return a;
    var base = (b.lastReviewed || 0) > (a.lastReviewed || 0) ? b : a;
    var other = base === a ? b : a;
    var out = JSON.parse(JSON.stringify(base));
    out.writing = out.writing || {};
    Object.keys(other.writing || {}).forEach(function (ch) {
      var w = other.writing[ch], mine = out.writing[ch];
      if (!mine || (w.last_practiced || 0) > (mine.last_practiced || 0)) out.writing[ch] = w;
    });
    if (!out.set) out.set = other.set || '';
    return out;
  }
  function mergeDaily(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    var out = {};
    // Số từ hôm nay: cùng ngày thì hợp danh sách, khác ngày thì lấy ngày mới hơn
    if (a.date === b.date) {
      var ids = (a.todayIds || []).slice();
      (b.todayIds || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      out.date = a.date; out.todayIds = ids; out.todayCount = ids.length;
    } else {
      var n = (a.date || '') > (b.date || '') ? a : b;
      out.date = n.date; out.todayIds = n.todayIds || []; out.todayCount = n.todayCount || 0;
    }
    // Chuỗi ngày: theo ngày học gần nhất; cùng ngày thì lấy chuỗi dài hơn
    var la = a.lastStudyDate || '', lb = b.lastStudyDate || '';
    if (la === lb) { out.lastStudyDate = la; out.streakCount = Math.max(a.streakCount || 0, b.streakCount || 0); }
    else { var s = la > lb ? a : b; out.lastStudyDate = s.lastStudyDate; out.streakCount = s.streakCount || 0; }
    // Mục tiêu: lần đổi gần nhất
    var g = (b.goalAt || 0) > (a.goalAt || 0) ? b : a;
    if (g.dailyGoal) out.dailyGoal = g.dailyGoal;
    out.goalAt = g.goalAt || 0;
    return out;
  }
  function mergeSettings(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    var s = (b.startAt || 0) > (a.startAt || 0) ? b : a;
    return {
      startLevel: s.startLevel || 1,
      startAt: s.startAt || 0,
      unlocked: Math.max(a.unlocked || 1, b.unlocked || 1)   // cấp đã mở không bao giờ khóa lại
    };
  }
  function mergeAll(local, cloud) {
    var progress = {};
    Object.keys(local.progress || {}).forEach(function (id) { progress[id] = local.progress[id]; });
    Object.keys(cloud.progress || {}).forEach(function (id) { progress[id] = mergeRecord(progress[id], cloud.progress[id]); });
    return {
      progress: progress,
      daily: mergeDaily(local.daily, cloud.daily),
      settings: mergeSettings(local.settings, cloud.settings)
    };
  }
  /** Tài khoản vừa được đặt lại ở thiết bị khác: bỏ dữ liệu cũ hơn thời điểm đó */
  function dropBefore(data, t) {
    var progress = {};
    Object.keys(data.progress || {}).forEach(function (id) {
      if (recTime(data.progress[id]) > t) progress[id] = data.progress[id];
    });
    return { progress: progress, daily: null, settings: null };
  }

  /* ============================================================
   * Firebase SDK (chỉ tải khi cần: người chưa chọn chế độ hoặc đã đăng nhập)
   * ============================================================ */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var sdkPromise = null;
  function loadSdk() {
    if (!configured || isFile) return Promise.reject(new Error('unavailable'));
    if (!sdkPromise) {
      sdkPromise = loadScript(SDK + 'firebase-app-compat.js')
        .then(function () {
          return Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
        })
        .then(function () {
          firebase.initializeApp(cfg);
          auth = firebase.auth();
          auth.languageCode = 'vi';
          db = firebase.firestore();
          auth.onAuthStateChanged(onAuth);
        })
        .catch(function (e) { sdkPromise = null; setStatus('offline'); throw e; });
    }
    return sdkPromise;
  }

  function onAuth(u) {
    authResolved = true;
    user = u;
    if (u) {
      // Dữ liệu trên máy thuộc tài khoản khác → xóa trước khi gộp. Dữ liệu học thử (chưa có uid) được giữ để gộp vào.
      if (meta.uid && meta.uid !== u.uid) { Store.clearLocal(); known = { words: {}, daily: null, settings: null }; meta.resetAt = 0; }
      meta.mode = 'user';
      meta.uid = u.uid;
      meta.name = u.displayName || '';
      meta.email = u.email || '';
      meta.photo = u.photoURL || '';
      saveMeta();
      setStatus('syncing');
      pull(true);
    } else {
      if (meta.mode === 'user') { meta.mode = ''; saveMeta(); }   // phiên hết hạn → về màn hình chào
      setStatus('idle');
    }
  }

  /* ============================================================
   * Đồng bộ
   * ============================================================ */
  var queue = Promise.resolve();
  function enqueue(fn) {
    queue = queue.then(fn, fn).catch(function (e) {
      console.warn('[sync]', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      scheduleRetry();
    });
    return queue;
  }
  /** Lỗi đồng bộ → tự thử lại sau 30 giây (không cần người học bấm gì) */
  var retryTimer = null;
  function scheduleRetry() {
    if (retryTimer || !user) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (user) Cloud.syncNow();
    }, 30 * 1000);
  }
  function userRef() { return db.collection('users').doc(user.uid); }
  function shardId(set) { return String(set || 'khac').replace(/[\/.]/g, '_') || 'khac'; }

  function pull(force) {
    if (!user) return Promise.resolve();
    if (!force && Date.now() - lastPull < PULL_MIN_GAP) return Promise.resolve();
    lastPull = Date.now();
    return enqueue(pullNow);
  }
  function pullNow() {
      if (!user) return;
      setStatus('syncing');
      return Promise.all([userRef().get(), userRef().collection('progress').get()]).then(function (res) {
        var doc = res[0].exists ? res[0].data() : {};
        var cloud = { progress: {}, daily: doc.daily || null, settings: doc.settings || null };
        known = { words: {}, daily: stable(cloud.daily), settings: stable(cloud.settings), profile: (doc.name || '') + '|' + (doc.email || '') };
        res[1].forEach(function (d) {
          var words = (d.data() || {}).words || {};
          Object.keys(words).forEach(function (id) {
            try { cloud.progress[id] = JSON.parse(words[id]); known.words[id] = words[id]; } catch (e) { /* bản ghi hỏng: bỏ qua */ }
          });
        });

        var local = Store.exportData();
        var resetAt = doc.resetAt || 0;
        if (resetAt > (meta.resetAt || 0)) { local = dropBefore(local, resetAt); meta.resetAt = resetAt; saveMeta(); }

        var merged = mergeAll(local, cloud);
        if (stable(merged) !== stable(Store.exportData())) {
          Store.importData(merged);
          fire('cloudsync');
        }
        return pushNow(true);
      });
  }

  /** Gửi các phần khác với bản trên đám mây. profile = cập nhật cả tên/email. */
  function pushNow(profile) {
    if (!user) return Promise.resolve();
    var d0 = Store.exportData();
    var headChanged = stable(d0.daily) !== known.daily || stable(d0.settings) !== known.settings;
    // Mục tiêu ngày / chuỗi / lộ trình là một khối: đọc bản trên đám mây và gộp trước khi ghi để không đè thiết bị khác
    return (headChanged ? userRef().get() : Promise.resolve(null)).then(function (snap) {
      if (snap) {
        var doc = snap.exists ? snap.data() : {};
        if ((doc.resetAt || 0) > (meta.resetAt || 0)) return pullNow();   // vừa bị đặt lại ở máy khác: tải lại, không đẩy dữ liệu cũ
        var md = mergeDaily(d0.daily, doc.daily || null), ms = mergeSettings(d0.settings, doc.settings || null);
        if (stable(md) !== stable(d0.daily) || stable(ms) !== stable(d0.settings)) {
          Store.importData({ progress: Store.exportData().progress, daily: md, settings: ms });
          if (stable(ms) !== stable(d0.settings)) fire('cloudsync');
        }
      }
      return writeChanges(profile);
    });
  }
  function writeChanges(profile) {
    if (!user) return Promise.resolve();
    var data = Store.exportData(), batch = db.batch(), ops = 0;
    var shards = {}, sent = {};
    Object.keys(data.progress).forEach(function (id) {
      var rec = data.progress[id], str = stable(rec);
      if (known.words[id] === str) return;
      var sid = shardId(rec.set);
      (shards[sid] = shards[sid] || {})[id] = str;
      sent[id] = str;
    });
    Object.keys(shards).forEach(function (sid) {
      batch.set(userRef().collection('progress').doc(sid), { words: shards[sid] }, { merge: true });
      ops++;
    });

    var head = {}, dStr = stable(data.daily), sStr = stable(data.settings);
    if (dStr !== known.daily) head.daily = data.daily || firebase.firestore.FieldValue.delete();
    if (sStr !== known.settings) head.settings = data.settings || firebase.firestore.FieldValue.delete();
    var prof = meta.name + '|' + meta.email;
    if (profile && known.profile !== prof) { head.name = meta.name; head.email = meta.email; }
    if (ops || Object.keys(head).length) {
      head.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(userRef(), head, { merge: true });
      ops++;
    }
    if (!ops) { markSynced(); return Promise.resolve(); }

    setStatus('syncing');
    return batch.commit().then(function () {
      Object.keys(sent).forEach(function (id) { known.words[id] = sent[id]; });
      if ('daily' in head) known.daily = dStr;
      if ('settings' in head) known.settings = sStr;
      if ('email' in head) known.profile = prof;
      markSynced();
    });
  }
  function markSynced() {
    meta.syncedAt = Date.now(); saveMeta();
    setStatus(pendingTimer ? 'pending' : 'synced');
  }

  var pendingTimer = null;
  function schedulePush() {
    if (!user) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, PUSH_DELAY);
    if (status !== 'syncing') setStatus('pending');
  }
  function flush() {
    clearTimeout(pendingTimer); pendingTimer = null;
    if (!user) return Promise.resolve();
    return enqueue(function () { return pushNow(false); });
  }

  /** Đặt lại tiến độ: xóa cả trên đám mây, ghi mốc resetAt để thiết bị khác cũng bỏ dữ liệu cũ */
  function resetCloud() {
    if (!user) return;
    var t = Date.now();
    meta.resetAt = t; saveMeta();
    clearTimeout(pendingTimer); pendingTimer = null;
    enqueue(function () {
      return userRef().collection('progress').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (d) { batch.delete(d.ref); });
        batch.set(userRef(), {
          resetAt: t,
          daily: firebase.firestore.FieldValue.delete(),
          settings: firebase.firestore.FieldValue.delete(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return batch.commit();
      }).then(function () {
        known = { words: {}, daily: 'null', settings: 'null' };
        return pushNow(false);
      });
    });
  }

  Store.onWrite = schedulePush;
  Store.onReset = resetCloud;

  // Rời trang / chuyển app: gửi ngay. Quay lại: tải bản mới từ thiết bị khác.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (pendingTimer) flush(); }
    else pull(false);
  });
  window.addEventListener('pagehide', function () { if (pendingTimer) flush(); });
  window.addEventListener('online', function () { if (user) { lastPull = 0; pull(false); } });

  /* ============================================================
   * API cho giao diện (js/account.js)
   * ============================================================ */
  var Cloud = {
    configured: configured,
    isFile: isFile,
    inApp: inApp,
    /** Có thể đăng nhập trên trang này không (đã cấu hình, chạy qua http/https) */
    canSignIn: function () { return configured && !isFile; },
    mode: function () { return meta.mode || ''; },
    info: function () {
      return {
        mode: meta.mode || '',
        signedIn: !!user,
        authResolved: authResolved,
        status: status,
        name: meta.name || '',
        email: meta.email || '',
        photo: meta.photo || '',
        syncedAt: meta.syncedAt || 0
      };
    },
    preload: function () { return loadSdk().catch(function () { /* hiển thị lỗi khi bấm đăng nhập */ }); },
    ready: function () { return !!auth; },

    /** Mở cửa sổ đăng nhập Google. Phải gọi trực tiếp trong sự kiện bấm (Safari chặn cửa sổ bật lên nếu trễ). */
    signIn: function () {
      function go() {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return auth.signInWithPopup(provider);
      }
      if (auth) return go();
      setStatus('loading');
      return loadSdk().then(go);
    },
    signOut: function () {
      return flush().then(function () { return auth ? auth.signOut() : null; }).then(function () {
        Store.clearLocal();
        meta = { mode: '' };
        saveMeta();
        location.reload();
      });
    },
    continueAsGuest: function () {
      meta.mode = 'guest'; saveMeta();
      fire('authchange', Cloud.info());
    },
    flush: flush,
    syncNow: function () { lastPull = 0; return flush().then(function () { return pull(true); }); },

    // Dùng cho kiểm thử
    _merge: { mergeRecord: mergeRecord, mergeDaily: mergeDaily, mergeSettings: mergeSettings, mergeAll: mergeAll, dropBefore: dropBefore, stable: stable }
  };
  window.Cloud = Cloud;

  // Đã đăng nhập trước đó → khôi phục phiên và đồng bộ. Chưa chọn chế độ → tải sẵn SDK cho nút "Tiếp tục với Google".
  if (meta.mode !== 'guest' && configured && !isFile) loadSdk().catch(function () { /* mất mạng: vẫn học được trên máy */ });
})();
