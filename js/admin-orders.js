/*
 * Trang quản trị — mục "Đơn hàng tài liệu" (orders/{uid}_{productId}, xem js/support.js và firestore.rules).
 *
 *   Gửi tài liệu   mở Google Apps Script của chủ trang (bước 6.4): tạo link R2 24 giờ, soạn thư nháp Gmail cho người mua,
 *                  ghi đơn "đã gửi" rồi mở thư nháp để đọc lại và bấm Gửi. URL script lưu trên máy này (localStorage).
 *   Chưa thấy tiền ghi trạng thái unpaid + mở Gmail soạn sẵn thư nhắc lịch sự.
 *   Hủy đơn        ghi trạng thái cancelled (cancelReason: admin).
 * Tìm kiếm: dán nguyên nội dung chuyển khoản trong app ngân hàng (vd. "TAI LIEU COMBO MCXNZX FT24…") → tìm đúng đơn theo mã.
 */
(function () {
  var DAY = 24 * 60 * 60 * 1000;
  var EXPIRE_AFTER = 7 * DAY;
  var SCRIPT_KEY = 'vl-admin-apps-script';
  var STATUS = {
    pending: ['amber', 'bi-hourglass-split', 'Chờ thanh toán'],
    reported: ['jade', 'bi-send-check', 'Đã báo chuyển khoản'],
    sent: ['info', 'bi-envelope-check', 'Đã gửi tài liệu'],
    unpaid: ['rose', 'bi-exclamation-circle', 'Chưa thấy tiền'],
    cancelled: ['muted', 'bi-x-circle', 'Đã hủy'],
    expired: ['muted', 'bi-clock-history', 'Hết hạn (7 ngày)']
  };
  var FILTERS = [
    ['todo', 'Cần gửi tài liệu'], ['pending', 'Chờ thanh toán'], ['unpaid', 'Chưa thấy tiền'],
    ['sent', 'Đã gửi'], ['cancelled', 'Đã hủy / hết hạn'], ['', 'Tất cả']
  ];

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function when(d) { return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : '—'; }
  function ago(d) {
    if (!d) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' giờ trước';
    return Math.round(h / 24) + ' ngày trước';
  }
  function vnd(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
  function toDate(v) { return v && typeof v.toDate === 'function' ? v.toDate() : null; }
  function scriptUrl() { try { return localStorage.getItem(SCRIPT_KEY) || ''; } catch (e) { return ''; } }

  var PRODUCTS = ((window.SUPPORT_CONFIG || {}).DIGITAL_PRODUCTS || []);
  function productOf(id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0] || null; }

  var db = null, orders = [], loading = false, lastLoad = 0;

  function state(o) {
    if (o.status === 'pending' && o.created && Date.now() - o.created.getTime() > EXPIRE_AFTER) return 'expired';
    return o.status;
  }
  function inFilter(o, f) {
    var s = state(o);
    if (f === 'todo') return s === 'reported';
    if (f === 'cancelled') return s === 'cancelled' || s === 'expired';
    return !f || s === f;
  }

  function load() {
    if (!db || loading) return Promise.resolve();
    loading = true;
    return db.collection('orders').get().then(function (snap) {
      orders = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        orders.push({
          id: doc.id, uid: d.uid || '', email: d.email || '', name: d.name || '',
          productId: d.productId || '', productName: d.productName || '', price: d.price || 0,
          code: d.code || '', transfer: d.transfer || '', status: d.status || 'pending',
          created: toDate(d.createdAt), reported: toDate(d.reportedAt), sent: toDate(d.sentAt),
          updated: toDate(d.updatedAt), cancelled: toDate(d.cancelledAt), cancelReason: d.cancelReason || ''
        });
      });
      orders.sort(function (a, b) { return (b.updated ? b.updated.getTime() : 0) - (a.updated ? a.updated.getTime() : 0); });
      lastLoad = Date.now();
      $('#ord-error').classList.add('d-none');
      render();
    }).catch(function (e) {
      $('#ord-error').innerHTML = e && e.code === 'permission-denied'
        ? '<b>Chưa đọc được đơn hàng.</b> Kiểm tra Rules trên Firebase Console đã có phần <code>orders</code> (file <code>firestore.rules</code>) chưa.'
        : 'Không tải được đơn hàng: ' + esc(e && (e.message || e.code) || e);
      $('#ord-error').classList.remove('d-none');
    }).then(function () { loading = false; });
  }

  function render() {
    var sel = $('#ord-status'), f = sel.value;
    sel.innerHTML = FILTERS.map(function (x) {
      var n = orders.filter(function (o) { return inFilter(o, x[0]); }).length;
      return '<option value="' + x[0] + '"' + (x[0] === f ? ' selected' : '') + '>' + x[1] + ' (' + n + ')</option>';
    }).join('');
    var todo = orders.filter(function (o) { return state(o) === 'reported'; }).length;
    $('#ord-todo').textContent = todo ? todo + ' đơn cần gửi' : '';
    $('#ord-todo').classList.toggle('d-none', !todo);

    // Tìm: nội dung chuyển khoản chứa mã đơn, hoặc gõ một phần mã / email / tên → bỏ qua bộ lọc trạng thái
    var q = $('#ord-q').value.trim(), qn = q.toUpperCase().replace(/[^A-Z0-9]/g, ''), ql = q.toLowerCase();
    var list = q ? orders.filter(function (o) {
      return (o.code && qn.indexOf(o.code) >= 0) || (qn.length >= 3 && o.code.indexOf(qn) >= 0) ||
        (o.email + ' ' + o.name).toLowerCase().indexOf(ql) >= 0;
    }) : orders.filter(function (o) { return inFilter(o, f); });
    $('#ord-count').textContent = list.length;

    $('#ord-rows').innerHTML = list.length ? list.map(function (o) {
      var s = state(o), st = STATUS[s] || STATUS.pending, p = productOf(o.productId);
      var priceWarn = p && p.price !== o.price ? ' <span class="ord-warn" title="Khác giá hiện tại ' + vnd(p.price) + '"><i class="bi bi-exclamation-triangle"></i></span>' : '';
      var time = s === 'reported' ? 'Báo CK ' + when(o.reported) + '<div class="admin-ago">' + ago(o.reported) + '</div>'
        : s === 'sent' ? 'Gửi ' + when(o.sent) + '<div class="admin-ago">' + ago(o.sent) + '</div>'
        : s === 'cancelled' ? 'Hủy ' + when(o.cancelled) + '<div class="admin-ago">' + (o.cancelReason === 'admin' ? 'bởi admin' : 'người mua bấm "Tôi chưa mua"') + '</div>'
        : 'Tạo ' + when(o.created) + '<div class="admin-ago">' + ago(o.created) + '</div>';
      var acts = '';
      if (s !== 'cancelled' && s !== 'expired') {
        acts += '<button type="button" class="btn btn-sm ' + (s === 'sent' ? 'btn-soft' : 'btn-primary') + '" data-ord="send" data-id="' + esc(o.id) + '">' +
          '<i class="bi bi-envelope-paper"></i> ' + (s === 'sent' ? 'Gửi lại link' : 'Gửi tài liệu') + '</button>';
        if (s === 'reported' || s === 'pending') acts += '<button type="button" class="btn btn-sm btn-soft" data-ord="unpaid" data-id="' + esc(o.id) + '">Chưa thấy tiền</button>';
        if (s !== 'sent') acts += '<button type="button" class="btn btn-sm btn-soft ord-cancel" data-ord="cancel" data-id="' + esc(o.id) + '" title="Hủy đơn"><i class="bi bi-x-lg"></i></button>';
      }
      return '<tr class="ord-' + s + '">' +
        '<td><span class="ord-code">' + esc(o.code) + '</span><div class="admin-ago">' + esc(o.transfer) + '</div></td>' +
        '<td>' + esc(p ? p.name : o.productName) + '</td>' +
        '<td class="num">' + vnd(o.price) + priceWarn + '</td>' +
        '<td><div class="admin-email">' + esc(o.email) + '</div><div class="admin-ago">' + esc(o.name) + '</div></td>' +
        '<td><span class="ord-status ord-' + st[0] + '"><i class="bi ' + st[1] + '"></i> ' + st[2] + '</span></td>' +
        '<td>' + time + '</td>' +
        '<td class="ord-acts">' + acts + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="admin-empty">' + (q ? 'Không có đơn khớp với "' + esc(q) + '".' : 'Không có đơn nào ở mục này.') + '</td></tr>';

    var url = scriptUrl();
    $('#ord-script').innerHTML = url
      ? '<i class="bi bi-check-circle"></i> Đã nối Apps Script gửi tài liệu. <button type="button" class="ord-link" data-ord="script">Đổi URL</button>'
      : '<i class="bi bi-exclamation-circle"></i> Chưa nối Apps Script nên nút <b>Gửi tài liệu</b> chưa dùng được. <button type="button" class="ord-link" data-ord="script">Dán URL Apps Script</button>';
    $('#ord-script').classList.toggle('is-off', !url);
  }

  function find(id) { return orders.filter(function (o) { return o.id === id; })[0]; }
  function update(id, data) {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection('orders').doc(id).update(data).then(load);
  }
  function gmail(to, subject, body) {
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) +
      '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank', 'noopener');
  }
  function fail(e) { window.alert('Chưa lưu được: ' + (e && (e.message || e.code) || e)); }

  function act(kind, id) {
    var o = find(id);
    if (kind === 'script') {
      var v = window.prompt('URL Web app của Google Apps Script (dạng https://script.google.com/macros/s/…/exec).\nĐể trống để gỡ.', scriptUrl());
      if (v == null) return;
      v = v.trim();
      if (v && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) return window.alert('URL không đúng dạng https://script.google.com/macros/s/…/exec');
      try { v ? localStorage.setItem(SCRIPT_KEY, v) : localStorage.removeItem(SCRIPT_KEY); } catch (e) { /* bỏ qua */ }
      return render();
    }
    if (!o) return;
    if (kind === 'send') {
      var url = scriptUrl();
      if (!url) return window.alert('Chưa nối Apps Script (bước 6.4). Bấm "Dán URL Apps Script" ở đầu mục Đơn hàng.');
      if (state(o) === 'pending' && !window.confirm('Người mua chưa bấm "Đã chuyển khoản". Bạn đã thấy tiền ' + vnd(o.price) + ' với nội dung "' + o.transfer + '" chưa?\n\nBấm OK để soạn thư gửi tài liệu.')) return;
      // Apps Script tạo link 24 giờ + thư nháp, ghi đơn "đã gửi", rồi mở thư nháp. Quay lại trang này sẽ tự làm mới.
      window.open(url + '?action=send&id=' + encodeURIComponent(o.id), '_blank', 'noopener');
    } else if (kind === 'unpaid') {
      if (!window.confirm('Đánh dấu đơn ' + o.code + ' là "Chưa thấy tiền" và mở Gmail soạn thư nhắc người mua?')) return;
      // Mở Gmail ngay trong lần bấm (trình duyệt chặn cửa sổ mở sau khi chờ mạng), rồi mới ghi trạng thái
      gmail(o.email, 'Voc-Lang: chưa thấy thanh toán cho đơn ' + o.code,
        'Chào ' + (o.name || 'bạn') + ',\n\n' +
        'Cảm ơn bạn đã đặt "' + ((productOf(o.productId) || {}).name || o.productName) + '" trên Voc-Lang. Mình đã kiểm tra tài khoản nhưng chưa thấy khoản chuyển ' +
        vnd(o.price) + ' với nội dung "' + o.transfer + '".\n\n' +
        'Bạn xem lại giúp mình giao dịch trong app ngân hàng nhé. Nếu bạn đã chuyển, chỉ cần trả lời email này kèm ảnh chụp màn hình giao dịch, ' +
        'mình sẽ kiểm tra và gửi tài liệu ngay.\n\nCảm ơn bạn!\nVoc-Lang');
      update(o.id, { status: 'unpaid' }).catch(fail);
    } else if (kind === 'cancel') {
      if (!window.confirm('Hủy đơn ' + o.code + ' (' + o.email + ')? Người mua sẽ thấy đơn đã hủy và có thể tạo lại.')) return;
      update(o.id, { status: 'cancelled', cancelledAt: firebase.firestore.FieldValue.serverTimestamp(), cancelReason: 'admin' }).catch(fail);
    }
  }

  window.AdminOrders = {
    start: function (firestore) {
      db = firestore;
      $('#ord-status').addEventListener('change', render);
      $('#ord-q').addEventListener('input', render);
      $('#orders').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ord]');
        if (b) act(b.dataset.ord, b.dataset.id);
      });
      // Quay lại từ tab Apps Script / Gmail → tải lại (tối đa 1 lần mỗi 10 giây)
      window.addEventListener('focus', function () { if (Date.now() - lastLoad > 10000) load(); });
      // Mở từ email báo đơn mới (…/admin-report/#q=MÃĐƠN) → tìm sẵn đơn đó
      var m = location.hash.match(/^#q=(.+)$/);
      if (m) { $('#ord-q').value = decodeURIComponent(m[1]); $('#orders').scrollIntoView(); }
      render();
      return load();
    },
    load: load
  };
})();
