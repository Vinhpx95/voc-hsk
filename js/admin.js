/*
 * Trang báo cáo quản trị (admin-report/) — không có liên kết công khai, chỉ admin mở được.
 *
 * Bảo mật 2 lớp:
 *   1. Trên trang: chưa đăng nhập, hoặc email không khớp ADMIN_EMAIL_SHA256 (js/firebase-config.js) → chuyển về trang chủ.
 *   2. Trên Firestore: Rules chỉ cho email admin đọc danh sách users (firestore.rules). Người khác có sửa code trên
 *      trình duyệt cũng không đọc được dữ liệu.
 *
 * Dữ liệu đọc từ users/{uid}: email, name, firstLoginAt, lastActiveAt, sessionCount, learnedWordsCount, masteredWordsCount
 * (do js/sync.js ghi mỗi khi người học mở trang / học).
 */
(function () {
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var HOME = '../';
  var DAY = 24 * 60 * 60 * 1000;
  var cfg = window.FIREBASE_CONFIG || {};

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function leave() { location.replace(HOME); }

  if (!cfg.apiKey || !window.ADMIN_EMAIL_SHA256 || location.protocol === 'file:' || !window.crypto || !crypto.subtle) {
    leave();
    return;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  /* ---------- Định dạng ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d, withTime) {
    if (!d) return '—';
    var s = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    return withTime ? s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : s;
  }
  function isoLocal(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function ago(d) {
    if (!d) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' giờ trước';
    var days = Math.round(h / 24);
    return days === 1 ? 'hôm qua' : days + ' ngày trước';
  }
  function num(n) { return (n || 0).toLocaleString('vi-VN'); }
  function toDate(v) { return v && typeof v.toDate === 'function' ? v.toDate() : null; }
  function sameDay(a, b) { return a && a.toDateString() === b.toDateString(); }

  /* ---------- Dữ liệu ---------- */
  var rows = [];
  var db = null;

  function load() {
    $('#btn-refresh').disabled = true;
    $('#admin-error').classList.add('d-none');
    return db.collection('users').get().then(function (snap) {
      rows = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        rows.push({
          email: d.email || '',
          name: d.name || '',
          joined: toDate(d.firstLoginAt),
          last: toDate(d.lastActiveAt) || toDate(d.updatedAt),
          sessions: d.sessionCount || 0,
          learned: typeof d.learnedWordsCount === 'number' ? d.learnedWordsCount : null,
          mastered: typeof d.masteredWordsCount === 'number' ? d.masteredWordsCount : null
        });
      });
      // Hoạt động gần nhất lên đầu
      rows.sort(function (a, b) { return (b.last ? b.last.getTime() : 0) - (a.last ? a.last.getTime() : 0); });
      render();
      $('#admin-updated').textContent = 'Cập nhật lúc ' + fmtDate(new Date(), true);
      $('#btn-export').disabled = !rows.length;
    }).catch(function (e) {
      var msg = e && e.code === 'permission-denied'
        ? '<b>Firestore chưa cho phép tài khoản quản trị đọc dữ liệu.</b> Hãy cập nhật Rules theo file <code>firestore.rules</code> ' +
          '(Firebase Console → Firestore Database → Rules → Publish), rồi bấm Làm mới.'
        : 'Không tải được dữ liệu: ' + esc(e && (e.message || e.code) || e) + '. Kiểm tra mạng rồi bấm Làm mới.';
      $('#admin-error').innerHTML = msg;
      $('#admin-error').classList.remove('d-none');
      $('#admin-updated').textContent = 'Chưa tải được dữ liệu';
    }).then(function () { $('#btn-refresh').disabled = false; });
  }

  function render() {
    var now = new Date(), weekAgo = Date.now() - 7 * DAY;
    var sessions = rows.reduce(function (n, r) { return n + r.sessions; }, 0);
    $('#kpi-users').textContent = num(rows.length);
    $('#kpi-sessions').textContent = num(sessions);
    $('#kpi-sessions-note').textContent = rows.length
      ? 'trung bình ' + (sessions / rows.length).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' lượt / người'
      : 'toàn hệ thống';
    $('#kpi-new').textContent = num(rows.filter(function (r) { return r.joined && r.joined.getTime() >= weekAgo; }).length);
    $('#kpi-today').textContent = num(rows.filter(function (r) { return sameDay(r.last, now); }).length);
    renderTable();
  }

  function renderTable() {
    var q = $('#admin-q').value.trim().toLowerCase();
    var list = q ? rows.filter(function (r) { return (r.email + ' ' + r.name).toLowerCase().indexOf(q) >= 0; }) : rows;
    $('#admin-count').textContent = q ? list.length + ' / ' + rows.length : rows.length;
    $('#admin-rows').innerHTML = list.length ? list.map(function (r, i) {
      var learned = r.learned == null ? '<span class="text-muted-2">—</span>'
        : num(r.learned) + (r.mastered ? ' <span class="admin-mastered">(' + num(r.mastered) + ' thuộc)</span>' : '');
      var isToday = sameDay(r.last, new Date());
      return '<tr>' +
        '<td class="text-muted-2">' + (i + 1) + '</td>' +
        '<td class="admin-email">' + esc(r.email) + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + fmtDate(r.joined) + '</td>' +
        '<td><span class="admin-dot' + (isToday ? ' on' : '') + '"></span>' + fmtDate(r.last, true) +
          '<div class="admin-ago">' + ago(r.last) + '</div></td>' +
        '<td class="num">' + num(r.sessions) + '</td>' +
        '<td class="num">' + learned + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="admin-empty">' + (q ? 'Không có tài khoản phù hợp.' : 'Chưa có tài khoản nào.') + '</td></tr>';
  }

  /* ---------- Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) ---------- */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // chặn Excel hiểu nhầm thành công thức
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var head = ['STT', 'Email', 'Tên', 'Ngày tham gia', 'Hoạt động gần nhất', 'Số lần sử dụng', 'Số từ đã học', 'Số từ đã thuộc'];
    var lines = [head.map(csvCell).join(',')].concat(rows.map(function (r, i) {
      return [i + 1, r.email, r.name, isoLocal(r.joined), isoLocal(r.last), r.sessions,
        r.learned == null ? '' : r.learned, r.mastered == null ? '' : r.mastered].map(csvCell).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'voc-lang-bao-cao-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- Khởi động: kiểm tra quyền rồi mới hiện trang ---------- */
  function start(user) {
    db = firebase.firestore();
    $('#admin-who').textContent = user.email;
    $('#admin-gate').remove();
    $('#admin-app').classList.remove('d-none');
    $('#btn-refresh').addEventListener('click', load);
    $('#btn-export').addEventListener('click', exportCsv);
    $('#admin-q').addEventListener('input', renderTable);
    load();
  }

  loadScript(SDK + 'firebase-app-compat.js')
    .then(function () {
      return Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
    })
    .then(function () {
      firebase.initializeApp(cfg);
      var stop = firebase.auth().onAuthStateChanged(function (u) {
        stop();
        if (!u || !u.email || !u.emailVerified) return leave();
        sha256(u.email.trim().toLowerCase()).then(function (h) {
          if (h !== window.ADMIN_EMAIL_SHA256) return leave();
          start(u);
        }, leave);
      });
    })
    .catch(leave);
})();
