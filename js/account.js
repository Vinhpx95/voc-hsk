/*
 * Giao diện tài khoản: màn hình chào (chưa đăng nhập), nút Google, menu tài khoản trên thanh điều hướng,
 * ghi chú đồng bộ trong Cài đặt. Dữ liệu và đăng nhập nằm ở js/sync.js (window.Cloud).
 */
(function () {
  var root = document.documentElement;
  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var G_LOGO = $('#btn-google .g-logo').outerHTML;

  function toast(msg) {
    $('#toast-body').innerHTML = msg;
    bootstrap.Toast.getOrCreateInstance($('#app-toast'), { delay: 3200 }).show();
  }
  function showWelcome(v) {
    root.classList.toggle('show-welcome', v);
    if (v) { setLoading(false); Cloud.preload(); }
  }

  var total = (window.HSK_LEVELS || []).reduce(function (n, l) { return n + (l.count || 0); }, 0);
  if (total) $('#welcome-count').textContent = total.toLocaleString('vi-VN');

  /* Chưa cấu hình Firebase hoặc mở bằng file:// → không có đăng nhập, học như trước (không hiện màn hình chào).
   * Riêng index.html?welcome vẫn hiện màn hình chào để xem thử; nút Google khi đó chỉ báo lý do. */
  if (!Cloud.canSignIn()) {
    $('.account').classList.add('d-none');
    if (!/[?&]welcome(?:[=&]|$)/.test(location.search)) { root.classList.remove('show-welcome'); return; }
    $('#btn-google').addEventListener('click', function () {
      alertBox(Cloud.isFile
        ? 'Bản xem thử: đăng nhập chỉ hoạt động khi mở trang qua địa chỉ web (GitHub Pages hoặc localhost), không chạy khi mở file trực tiếp.'
        : 'Bản xem thử: đăng nhập Google chưa được cấu hình (xem HUONG-DAN-DANG-NHAP.md).');
    });
    $('#btn-guest').addEventListener('click', function () { root.classList.remove('show-welcome'); });
    return;
  }

  /* ============================================================
   * Màn hình chào
   * ============================================================ */
  function setLoading(v) {
    var b = $('#btn-google');
    b.disabled = v;
    b.querySelector('.spinner-border').classList.toggle('d-none', !v);
    b.querySelector('.g-logo').classList.toggle('d-none', v);
    b.querySelector('.btn-google-text').textContent = v ? 'Đang mở cửa sổ Google…' : 'Tiếp tục với Google';
  }
  function alertBox(html) {
    var a = $('#welcome-alert');
    a.innerHTML = html || '';
    a.classList.toggle('d-none', !html);
  }

  var IN_APP_MSG = '<b>Bạn đang mở trang trong một ứng dụng</b> (Zalo, Facebook…). Google không cho phép đăng nhập tại đây, ' +
    'hãy mở trang bằng Chrome hoặc Safari.<br><button type="button" class="btn btn-sm btn-soft" data-copy-link>' +
    '<i class="bi bi-link-45deg"></i> Sao chép liên kết</button>';

  function errorMessage(e) {
    var code = (e && e.code) || '';
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return '';
      case 'auth/popup-blocked':
        return 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên của trang này rồi bấm lại.';
      case 'auth/network-request-failed':
        return 'Không kết nối được tới Google. Kiểm tra mạng rồi thử lại.';
      case 'auth/unauthorized-domain':
        return 'Tên miền này chưa được phép đăng nhập. Chủ trang cần thêm nó vào Firebase → Authentication → Settings → Authorized domains.';
      case 'auth/operation-not-allowed':
        return 'Đăng nhập bằng Google chưa được bật cho trang này.';
      case 'auth/web-storage-unsupported':
      case 'auth/operation-not-supported-in-this-environment':
        return 'Trình duyệt này không hỗ trợ đăng nhập (có thể do chế độ ẩn danh hoặc chặn cookie). Hãy thử trình duyệt khác.';
    }
    if (!code) return 'Không tải được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.';
    return 'Đăng nhập chưa thành công, vui lòng thử lại. <span class="text-muted-2">(' + esc(code) + ')</span>';
  }

  var warnedInApp = false;
  function signIn() {
    // Trong Zalo/Facebook: báo trước một lần; bấm lại vẫn cho thử
    if (Cloud.inApp && !warnedInApp) { warnedInApp = true; alertBox(IN_APP_MSG); return; }
    alertBox('');
    setLoading(true);
    var p;
    try { p = Cloud.signIn(); } catch (e) { p = Promise.reject(e); }
    p.then(function (cred) {
      showWelcome(false);
      var name = cred && cred.user && cred.user.displayName;
      toast('<i class="bi bi-cloud-check"></i> Xin chào' + (name ? ' <b>' + esc(name) + '</b>' : '') +
        '! Tiến độ học sẽ tự động đồng bộ trên mọi thiết bị.');
    }).catch(function (e) {
      setLoading(false);
      alertBox(errorMessage(e));
    });
  }

  $('#btn-google').addEventListener('click', signIn);
  $('#btn-guest').addEventListener('click', function () {
    Cloud.continueAsGuest();
    showWelcome(false);
    toast('Bạn có thể đăng nhập bất cứ lúc nào ở biểu tượng <i class="bi bi-person"></i> góc trên bên phải.');
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-link]');
    if (!b) return;
    var url = location.href.split('#')[0];
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      b.innerHTML = '<i class="bi bi-check2"></i> Đã sao chép';
    }, function () { window.prompt('Sao chép liên kết này:', url); });
  });
  if (Cloud.inApp && root.classList.contains('show-welcome')) { warnedInApp = true; alertBox(IN_APP_MSG); }

  /* ============================================================
   * Menu tài khoản + ghi chú đồng bộ
   * ============================================================ */
  function avatarHtml(info, cls) {
    var letter = esc(((info.name || info.email || '?').trim()[0] || '?').toUpperCase());
    var img = info.photo
      ? '<img src="' + esc(info.photo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">'
      : '';
    return '<span class="avatar ' + (cls || '') + '">' + (img || letter) + '</span>';
  }
  function timeText(t) {
    if (!t) return '';
    var d = new Date(t), now = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return d.toDateString() === now.toDateString() ? 'lúc ' + hm : hm + ' ngày ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  function statusLine(info) {
    switch (info.status) {
      case 'synced': return { cls: 'ok', icon: 'bi-cloud-check', text: 'Đã đồng bộ ' + timeText(info.syncedAt) };
      case 'pending':
      case 'syncing':
      case 'loading': return { cls: 'warn', icon: 'bi-arrow-repeat', text: 'Đang đồng bộ…' };
      case 'offline': return { cls: 'bad', icon: 'bi-cloud-slash', text: 'Đang ngoại tuyến. Tiến độ vẫn lưu trên máy và sẽ đồng bộ khi có mạng.' };
      case 'error': return { cls: 'bad', icon: 'bi-exclamation-triangle', text: 'Chưa đồng bộ được. Bấm “Đồng bộ ngay” để thử lại.' };
      default: return { cls: '', icon: 'bi-cloud', text: info.syncedAt ? 'Đồng bộ gần nhất ' + timeText(info.syncedAt) : 'Đang kết nối…' };
    }
  }

  function render() {
    var info = Cloud.info(), box = $('.account');
    box.dataset.mode = info.mode;
    box.dataset.status = info.status;

    if (info.mode === 'user') {
      var st = statusLine(info);
      $('#account-avatar').outerHTML = avatarHtml(info).replace('<span class="avatar', '<span id="account-avatar" class="avatar');
      $('#btn-account').title = info.name || info.email;
      $('#account-menu').innerHTML =
        '<div class="account-head">' + avatarHtml(info, 'avatar-lg') +
          '<div><div class="account-name">' + esc(info.name || 'Tài khoản Google') + '</div>' +
          '<div class="account-email">' + esc(info.email) + '</div></div></div>' +
        '<div class="account-status ' + st.cls + '"><i class="bi ' + st.icon + '"></i><span>' + st.text + '</span></div>' +
        '<button type="button" class="dropdown-item" data-act="sync"><i class="bi bi-arrow-repeat"></i> Đồng bộ ngay</button>' +
        '<button type="button" class="dropdown-item" data-act="signout"><i class="bi bi-box-arrow-right"></i> Đăng xuất</button>';
      $('#sync-note').innerHTML = '<i class="bi bi-cloud-check"></i> Tiến độ được đồng bộ với tài khoản <b>' + esc(info.email || info.name) + '</b>.';
      $('#reset-scope').textContent = ' trên mọi thiết bị đã đăng nhập';
    } else {
      $('#account-avatar').outerHTML = '<span id="account-avatar" class="avatar"><i class="bi bi-person"></i></span>';
      $('#btn-account').title = 'Đăng nhập';
      $('#account-menu').innerHTML =
        '<div class="account-guest">' +
          '<p class="account-title">Bạn đang học không đăng nhập</p>' +
          '<p>Tiến độ chỉ lưu trên trình duyệt này. Đăng nhập để giữ tiến độ và học tiếp trên cả máy tính lẫn điện thoại. Miễn phí.</p>' +
          '<button type="button" class="btn-google btn-google-sm" data-act="signin">' + G_LOGO +
            '<span>Tiếp tục với Google</span></button>' +
        '</div>';
      $('#sync-note').innerHTML = 'Tiến độ chỉ lưu trên trình duyệt này. <a href="#" data-act="signin">Đăng nhập</a> để đồng bộ giữa các thiết bị.';
      $('#reset-scope').textContent = '';
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (act === 'signin') {
      e.preventDefault();
      var m = bootstrap.Modal.getInstance($('#settings-modal')); if (m) m.hide();
      showWelcome(true);
      alertBox('');
    } else if (act === 'sync') {
      e.preventDefault();
      Cloud.syncNow();
    } else if (act === 'signout') {
      Cloud.flush().then(function () {
        var st = Cloud.info().status;
        if ((st === 'offline' || st === 'error') &&
            !window.confirm('Một phần tiến độ chưa kịp đồng bộ lên tài khoản. Nếu đăng xuất bây giờ, phần đó sẽ bị mất. Vẫn đăng xuất?')) return;
        Cloud.signOut();
      });
    }
  });

  // Không đóng menu khi bấm "Đồng bộ ngay" để thấy trạng thái cập nhật
  $('#account-menu').addEventListener('click', function (e) {
    if (e.target.closest('[data-act="sync"]')) e.stopPropagation();
  });

  window.addEventListener('authchange', function (e) {
    var info = e.detail || Cloud.info();
    render();
    if (info.signedIn) showWelcome(false);
    else if (info.authResolved && !info.mode) showWelcome(true);   // phiên đăng nhập hết hạn
  });
  render();
})();
