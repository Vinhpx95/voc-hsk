/*
 * Hai modal độc lập, dùng chung PAYMENT_CONFIG (js/support-config.js):
 *   #resources-modal  "Tài liệu học tập": chọn gói tài liệu số → VietQR đúng giá, nội dung "Tai lieu <codePrefix> <4 số>"
 *   #donate-modal     "Mời tác giả ly trà": chọn mức ủng hộ → VietQR, nội dung "Ung ho duy tri web"
 * Mở modal: phần tử bất kỳ có data-support-open="resources" | "donate".
 *
 * Khi thông tin chuyển khoản còn là mẫu, mọi lối vào (.support-entry) tự ẩn trên trang thật, chỉ hiện ở localhost để xem thử.
 */
(function () {
  var C = window.SUPPORT_CONFIG;
  if (!C || !C.PAYMENT_CONFIG) return;
  var P = C.PAYMENT_CONFIG;
  var PRODUCTS = C.DIGITAL_PRODUCTS || [];
  var TIERS = C.DONATE_TIERS || [];
  var MIN = C.DONATE_MIN || 10000;

  var placeholder = P.accountNo === '0123456789' || P.accountName === 'NGUYEN VAN A' || !P.accountNo;
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  var visible = !placeholder || local || C.SHOW_SAMPLE === true;
  if (visible) document.documentElement.classList.add('support-on');

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vnd(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
  function short(n) { return n >= 1000 && n % 1000 === 0 ? n / 1000 + 'k' : vnd(n); }
  function qrUrl(amount, message) {
    return 'https://img.vietqr.io/image/' + encodeURIComponent(P.bankId) + '-' + encodeURIComponent(P.accountNo) +
      '-compact2.png?amount=' + amount + '&addInfo=' + encodeURIComponent(message) +
      '&accountName=' + encodeURIComponent(P.accountName);
  }
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------- Sao chép ---------- */
  function copyText(text) {
    // Clipboard API có thể bị chặn (khung nhúng, trình duyệt trong app) → thử cách cũ execCommand
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return copyLegacy(text); });
    }
    return copyLegacy(text);
  }
  function copyLegacy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); }
      ta.remove();
    });
  }
  var flashTimers = new WeakMap();
  function flash(btn, html) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.innerHTML = html;
    btn.classList.add('is-done');
    clearTimeout(flashTimers.get(btn));
    flashTimers.set(btn, setTimeout(function () {
      btn.innerHTML = btn.dataset.label; delete btn.dataset.label;
      btn.classList.remove('is-done');
    }, 2000));
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /** Ảnh QR tải về khi còn là thông tin mẫu: đóng dấu "MẪU · KHÔNG CHUYỂN KHOẢN" chéo qua ảnh */
  function stampSample(ctx, w, h) {
    ctx.save();
    ctx.translate(w / 2, h * .42);
    ctx.rotate(-Math.PI / 9);
    ctx.fillStyle = 'rgba(225, 29, 72, .82)';
    ctx.fillRect(-w, -h * .055, w * 2, h * .11);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(h * .05) + 'px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('MẪU · KHÔNG CHUYỂN KHOẢN', 0, 0);
    ctx.restore();
  }

  /* ============================================================
   * Khung thanh toán VietQR — dùng chung cho cả 2 modal
   * ============================================================ */
  function PayPanel(root, modal) {
    root.innerHTML =
      '<div class="sp-pay-head"><span class="sp-pay-for"></span><span class="sp-pay-amount"></span></div>' +
      '<div class="sp-qr' + (placeholder ? ' is-sample' : '') + '">' +
        '<img alt="" width="270" height="320" referrerpolicy="no-referrer">' +
        (placeholder ? '<span class="sp-qr-sample" aria-hidden="true">MẪU</span>' : '') +
        '<div class="sp-qr-state sp-qr-loading"><span class="spinner-border spinner-border-sm"></span> Đang tạo mã QR…</div>' +
        '<div class="sp-qr-state sp-qr-error"><i class="bi bi-wifi-off"></i> Không tải được mã QR. Bạn vẫn có thể chuyển khoản theo thông tin bên dưới.</div>' +
        '<div class="sp-qr-state sp-qr-empty"><i class="bi bi-qr-code"></i> Nhập số tiền để tạo mã QR</div>' +
      '</div>' +
      '<div class="sp-qr-actions">' +
        '<button type="button" class="btn btn-soft" data-pay="download"><i class="bi bi-download"></i> Tải ảnh QR</button>' +
        '<button type="button" class="btn btn-soft" data-pay="copy-account"><i class="bi bi-copy"></i> Sao chép Số tài khoản</button>' +
      '</div>' +
      '<div class="sp-hint"><i class="bi bi-phone"></i> Trên điện thoại: tải ảnh QR, mở app ngân hàng → Quét QR → chọn ảnh từ thư viện.</div>' +
      '<dl class="sp-info">' +
        '<div><dt>Ngân hàng</dt><dd>' + esc(P.bankName || P.bankId) + '</dd></div>' +
        '<div><dt>Số tài khoản</dt><dd class="sp-mono" data-field="account">' + esc(P.accountNo) + '</dd></div>' +
        '<div><dt>Chủ tài khoản</dt><dd>' + esc(P.accountName) + '</dd></div>' +
        '<div><dt>Nội dung</dt><dd><span class="sp-mono" data-field="message"></span>' +
          '<button type="button" class="sp-copy-mini" data-pay="copy-message" title="Sao chép nội dung" aria-label="Sao chép nội dung chuyển khoản"><i class="bi bi-copy"></i></button></dd></div>' +
      '</dl>' +
      '<div class="sp-pay-extra"></div>';

    var img = $('img', root), frame = $('.sp-qr', root), dl = $('[data-pay="download"]', root);
    var cur = { amount: 0, message: '' }, src = '', token = 0, png = null;

    function update(amount, message, forText) {
      cur = { amount: amount, message: message };
      $('.sp-pay-for', root).textContent = forText || '';
      $('.sp-pay-amount', root).textContent = amount ? vnd(amount) : '—';
      $('[data-field="message"]', root).textContent = message;
      var ok = amount > 0;
      frame.classList.toggle('is-empty', !ok);
      dl.disabled = !ok;
      if (!ok) { frame.classList.remove('is-loading', 'is-error'); return; }
      var url = qrUrl(amount, message);
      if (url === src) return;
      var t = ++token;
      src = url; png = null;
      frame.classList.add('is-loading');
      frame.classList.remove('is-error');
      img.onload = function () {
        if (t !== token) return;
        frame.classList.remove('is-loading');
        if (modal.classList.contains('show')) toPng().catch(function () {});   // chuẩn bị sẵn để nút Tải phản hồi ngay
      };
      img.onerror = function () { if (t === token) { frame.classList.remove('is-loading'); frame.classList.add('is-error'); } };
      img.src = url;
      img.alt = 'Mã VietQR chuyển ' + vnd(amount) + ', nội dung: ' + message;
    }

    /* Tải ảnh QR dạng PNG để app ngân hàng quét được từ thư viện ảnh */
    function toPng() {
      if (png && png.url === src) return png.promise;
      var url = src;
      function get(u) {
        return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); });
      }
      // Link .png của VietQR chuyển hướng (301) sang .svg nhưng bước chuyển hướng thiếu CORS → gọi thẳng .svg trước
      var promise = get(url.replace('-compact2.png', '-compact2.svg')).catch(function () { return get(url); }).then(function (blob) {
        if (/png/.test(blob.type)) return blob;
        return new Promise(function (resolve, reject) {
          var u = URL.createObjectURL(blob), im = new Image();
          im.onload = function () {
            var w = im.naturalWidth || 540, h = im.naturalHeight || 640, s = 2;
            var cv = document.createElement('canvas');
            cv.width = w * s; cv.height = h * s;
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(im, 0, 0, cv.width, cv.height);
            if (placeholder) stampSample(ctx, cv.width, cv.height);
            URL.revokeObjectURL(u);
            cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
          };
          im.onerror = function () { URL.revokeObjectURL(u); reject(new Error('svg')); };
          im.src = u;
        });
      });
      png = { url: url, promise: promise };
      promise.catch(function () { if (png && png.promise === promise) png = null; });
      return promise;
    }
    function download() {
      var name = 'voc-lang-qr-' + cur.amount + '.png', label = dl.innerHTML;
      dl.disabled = true;
      dl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang tạo ảnh…';
      toPng().then(function (blob) {
        var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
        // iPhone/iPad: tệp tải về nằm trong app Tệp, app ngân hàng không thấy → dùng bảng chia sẻ để "Lưu hình ảnh"
        if (isIOS && file && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file] }).catch(function (e) {
            if (e && e.name === 'AbortError') return;
            saveBlob(blob, name);
          });
        }
        saveBlob(blob, name);
        dl.innerHTML = label;
        flash(dl, '<i class="bi bi-check2-circle"></i> Đã tải ảnh QR');
        return 'flashed';
      }).catch(function () {
        window.open(src, '_blank', 'noopener');   // không tạo được PNG → mở ảnh gốc để giữ lâu và lưu
      }).then(function (r) {
        dl.disabled = false;
        if (r !== 'flashed') dl.innerHTML = label;
      });
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pay]');
      if (!b) return;
      if (b.dataset.pay === 'download') return download();
      var isAcc = b.dataset.pay === 'copy-account', text = isAcc ? P.accountNo : cur.message;
      copyText(text).then(function () {
        flash(b, isAcc ? '<i class="bi bi-check2-circle"></i> Đã sao chép!' : '<i class="bi bi-check2"></i>');
      }, function () {
        // Không sao chép được (trình duyệt chặn) → bôi đen sẵn để người dùng tự sao chép
        var target = $('[data-field="' + (isAcc ? 'account' : 'message') + '"]', root);
        var range = document.createRange(), sel = window.getSelection();
        range.selectNodeContents(target); sel.removeAllRanges(); sel.addRange(range);
        flash(b, isAcc ? '<i class="bi bi-hand-index"></i> Nhấn giữ để sao chép' : '<i class="bi bi-hand-index"></i>');
      });
    });

    return { update: update, extra: $('.sp-pay-extra', root) };
  }

  /* ============================================================
   * Đơn mua tài liệu — Firestore orders/{uid}_{productId} (quy tắc trong firestore.rules)
   *   pending   chờ thanh toán (lưu ngay khi mã QR hiện ra)
   *   reported  người mua bấm "Đã chuyển khoản" → Apps Script báo email cho chủ trang
   *   sent      chủ trang đã gửi link tải · unpaid: chưa thấy tiền · cancelled: đã hủy
   * Mỗi tài khoản một đơn cho mỗi gói, mã chuyển khoản cố định theo tài khoản + gói.
   * ============================================================ */
  var MINUTE = 60 * 1000, DAY = 24 * 60 * MINUTE;
  var REMIND_AFTER = 10 * MINUTE;      // đơn chờ quá 10 phút chưa báo chuyển khoản → nhắc
  var EXPIRE_AFTER = 7 * DAY;          // đơn chờ quá 7 ngày → coi như đã hủy
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bỏ 0/O, 1/I cho dễ đọc
  var Orders = (function () {
    var data = {}, uid = '';           // productId → dữ liệu đơn (null: chưa có)
    function cloud() { return window.Cloud; }
    function account() { var c = cloud(); return c && c.account ? c.account() : null; }
    function ref(pid) { return cloud().orderRef(pid); }
    function T() { return cloud().serverTime(); }
    function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
    /** Mã 6 ký tự từ SHA-256(uid:productId) */
    function codeFor(u, pid) {
      var text = u + ':' + pid;
      var bytes = window.crypto && crypto.subtle
        ? crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) { return new Uint8Array(b); })
        : Promise.resolve(new Uint8Array(text.split('').map(function (c, i) { return (c.charCodeAt(0) * 31 + i * 7) & 255; })));
      return bytes.then(function (b) {
        var out = '';
        for (var i = 0; i < 6; i++) out += CODE_CHARS[b[i] % 32];
        return out;
      });
    }
    function transferOf(p, code) { return 'Tai lieu ' + p.codePrefix + ' ' + code; }
    /** Trạng thái để hiển thị: none | pending | reported | sent | unpaid | cancelled | expired */
    function state(pid) {
      var o = data[pid];
      if (!o) return 'none';
      if (o.status === 'pending' && Date.now() - ms(o.createdAt) > EXPIRE_AFTER) return 'expired';
      return o.status;
    }
    function fetchOne(pid) {
      return ref(pid).get().then(function (s) { data[pid] = s.exists ? s.data() : null; return data[pid]; });
    }
    function load() {
      var a = account();
      if (!a) { data = {}; uid = ''; return Promise.resolve(); }
      if (uid !== a.uid) { data = {}; uid = a.uid; }
      return Promise.all(PRODUCTS.map(function (p) { return fetchOne(p.id); }));
    }
    /** Mã QR hiện ra → bảo đảm có đơn "chờ thanh toán" (tạo mới, hoặc mở lại đơn đã hủy / quá hạn / đổi giá) */
    function ensure(p) {
      var a = account();
      if (!a) return Promise.reject(new Error('signed-out'));
      return codeFor(a.uid, p.id).then(function (code) {
        var o = data[p.id], st = state(p.id);
        var body = { name: (a.name || '').slice(0, 100), productName: p.name, price: p.price, code: code, transfer: transferOf(p, code) };
        if (st === 'none') {
          return ref(p.id).set(Object.assign({ uid: a.uid, email: a.email, productId: p.id, status: 'pending', createdAt: T(), updatedAt: T() }, body))
            .then(function () { return fetchOne(p.id); });
        }
        var stale = st === 'pending' && (o.price !== p.price || o.productName !== p.name || o.transfer !== body.transfer);
        if (st === 'cancelled' || st === 'expired' || stale) {
          return ref(p.id).update(Object.assign({ status: 'pending', createdAt: T(), updatedAt: T(), cancelledAt: cloud().deleteField(), cancelReason: cloud().deleteField() }, body))
            .then(function () { return fetchOne(p.id); });
        }
        return o;
      });
    }
    function report(pid) {
      return ref(pid).update({ status: 'reported', updatedAt: T(), reportedAt: T() }).then(function () { return fetchOne(pid); });
    }
    function cancel(pid) {
      return ref(pid).update({ status: 'cancelled', updatedAt: T(), cancelledAt: T(), cancelReason: 'buyer' }).then(function () { return fetchOne(pid); });
    }
    /** Đơn chờ thanh toán từ 10 phút đến 7 ngày → cần nhắc */
    function due() {
      return PRODUCTS.filter(function (p) {
        var age = data[p.id] && Date.now() - ms(data[p.id].createdAt);
        return state(p.id) === 'pending' && age >= REMIND_AFTER;
      });
    }
    /** Lần kiểm tra nhắc tiếp theo (ms), 0 nếu không cần */
    function nextCheck() {
      var t = 0;
      PRODUCTS.forEach(function (p) {
        if (state(p.id) !== 'pending') return;
        var left = REMIND_AFTER - (Date.now() - ms(data[p.id].createdAt));
        if (left > 0 && (!t || left < t)) t = left;
      });
      return t;
    }
    return { load: load, ensure: ensure, report: report, cancel: cancel, state: state, get: function (pid) { return data[pid]; },
      due: due, nextCheck: nextCheck, ms: ms, account: account };
  })();

  function when(t) {
    return t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  }
  var STATUS_CHIP = {
    pending: ['sp-chip-amber', 'bi-hourglass-split', 'Chờ thanh toán'],
    reported: ['sp-chip-jade', 'bi-send-check', 'Đã báo chuyển khoản'],
    sent: ['sp-chip-jade', 'bi-envelope-check', 'Đã gửi tài liệu'],
    unpaid: ['sp-chip-rose', 'bi-exclamation-circle', 'Chưa thấy tiền']
  };

  /* ============================================================
   * Modal 1: Tài liệu học tập
   * ============================================================ */
  function initResources(modal) {
    var payRoot = $('.sp-pay', modal);
    var pay = PayPanel(payRoot, modal);
    var product = PRODUCTS.filter(function (p) { return p.default; })[0] || PRODUCTS[PRODUCTS.length - 1];
    var view = 'idle';          // idle | signin | loading | error | order
    var peek = false;           // đơn đã báo chuyển khoản: bấm "Xem lại thông tin chuyển khoản"
    var errText = '', busy = false, token = 0, remindTimer = null, pickOnLoad = false;

    var gate = document.createElement('div');
    gate.className = 'sp-gate';
    payRoot.appendChild(gate);
    var remind = document.createElement('div');
    remind.className = 'sp-remind';
    $('.modal-body', modal).insertBefore(remind, $('.sp-layout', modal));

    function cloud() { return window.Cloud; }
    function signedIn() { return !!Orders.account(); }
    function cardFor(pid) { return $('.sp-product input[value="' + pid + '"]', modal); }

    function renderList() {
      $('.sp-products', modal).innerHTML = PRODUCTS.map(function (p) {
        var on = p === product, chip = STATUS_CHIP[Orders.state(p.id)];
        return '<label class="sp-product' + (on ? ' active' : '') + '">' +
          '<input type="radio" name="sp-product" value="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sp-product-icon"><i class="bi ' + esc(p.icon || 'bi-file-earmark') + '"></i></span>' +
          '<span class="sp-product-body">' +
            '<span class="sp-product-top">' +
              '<span class="sp-product-name">' + esc(p.name) + '</span>' +
              (p.badge ? '<span class="sp-badge' + (p.default ? ' sp-badge-jade' : '') + '">' + esc(p.badge) + '</span>' : '') +
            '</span>' +
            '<span class="sp-product-desc">' + esc(p.description) + '</span>' +
            (chip ? '<span class="sp-chip ' + chip[0] + '"><i class="bi ' + chip[1] + '"></i> ' + chip[2] + '</span>' : '') +
            '<span class="sp-product-foot">' +
              (p.format ? '<span class="sp-format">' + esc(p.format) + '</span>' : '') +
              '<span class="sp-price">' + vnd(p.price) + (p.originalPrice ? ' <s>' + vnd(p.originalPrice) + '</s>' : '') + '</span>' +
            '</span>' +
          '</span>' +
          '<span class="sp-check" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
        '</label>';
      }).join('');
    }

    /* Khung bên phải: đăng nhập / đang tải / lỗi / trạng thái đơn / mã QR */
    function renderPay() {
      var st = Orders.state(product.id), o = Orders.get(product.id), a = Orders.account();
      var gated = true, html = '';
      /* Thư từ Gmail mới của Voc-Lang hay rơi vào Thư rác: nhắc người mua xem ở đó và bấm "Không phải thư rác" */
      var spamTip = '<p class="sp-spam-tip"><i class="bi bi-info-circle"></i> <span>Không thấy email từ <b>Voc-Lang</b>? ' +
        'Xem mục <b>Thư rác</b> (Spam) và <b>Quảng cáo</b>, rồi bấm <b>Không phải thư rác</b> để các thư sau vào hộp thư đến.</span></p>';
      if (view === 'signin') {
        html = '<i class="bi bi-person-lock sp-gate-icon"></i>' +
          '<p><b>Đăng nhập để mua tài liệu</b></p>' +
          '<p class="sp-gate-text">Mã chuyển khoản được tạo theo tài khoản của bạn. Tài liệu được gửi tới email Google của bạn trong vòng 24 giờ sau khi xác nhận thanh toán.</p>' +
          (cloud() && cloud().canSignIn()
            ? '<button type="button" class="btn btn-primary w-100" data-order="signin"><i class="bi bi-google"></i> Đăng nhập Google</button>'
            : '<p class="sp-gate-text">Mở Voc-Lang trên trình duyệt (Chrome, Safari…) để đăng nhập và mua.</p>') +
          (errText ? '<p class="sp-gate-error">' + errText + '</p>' : '');
      } else if (view === 'loading' || view === 'idle') {
        html = '<span class="spinner-border spinner-border-sm"></span><p class="sp-gate-text">Đang tạo đơn…</p>';
      } else if (view === 'error') {
        html = '<i class="bi bi-wifi-off sp-gate-icon"></i><p class="sp-gate-text">' + errText + '</p>' +
          '<button type="button" class="btn btn-soft w-100" data-order="retry"><i class="bi bi-arrow-clockwise"></i> Thử lại</button>';
      } else if (st === 'sent') {
        html = '<i class="bi bi-envelope-check sp-gate-icon is-ok"></i>' +
          '<p><b>Đã gửi tài liệu</b></p>' +
          '<p class="sp-gate-text">Link tải đã được gửi tới <b>' + esc(o.email) + '</b>' + (o.sentAt ? ' lúc ' + when(Orders.ms(o.sentAt)) : '') + '.</p>' +
          spamTip +
          '<p class="sp-gate-text">Link hết hạn hoặc chưa tải kịp? Trả lời email đó để nhận link mới.</p>';
      } else if (st === 'cancelled' || st === 'expired') {
        html = '<i class="bi bi-x-circle sp-gate-icon"></i>' +
          '<p><b>Đã hủy đơn</b></p>' +
          '<p class="sp-gate-text">' + (st === 'expired' ? 'Đơn chờ thanh toán quá 7 ngày nên đã tự hủy.' : 'Bạn đã hủy đơn gói này.') + ' Muốn mua thì bấm nút bên dưới để tạo lại mã chuyển khoản.</p>' +
          '<button type="button" class="btn btn-primary w-100" data-order="reopen"><i class="bi bi-cart"></i> Mua gói này</button>';
      } else if (st === 'reported' && !peek) {
        html = '<i class="bi bi-send-check sp-gate-icon is-ok"></i>' +
          '<p><b>Đã báo chuyển khoản</b></p>' +
          '<p class="sp-gate-text">Cảm ơn bạn! Mình đã nhận thông báo lúc ' + when(Orders.ms(o.reportedAt)) + '. ' +
          'Sau khi kiểm tra thanh toán, link tải sẽ được gửi tới <b>' + esc(o.email) + '</b> trong vòng 24 giờ.</p>' +
          spamTip +
          '<button type="button" class="btn btn-soft w-100" data-order="peek"><i class="bi bi-qr-code"></i> Xem lại thông tin chuyển khoản</button>';
      } else gated = false;

      payRoot.classList.toggle('is-gated', gated);
      gate.innerHTML = html;
      if (gated) return;

      pay.update(product.price, o.transfer, product.name);
      var note, btns = '';
      if (st === 'reported') {
        note = 'Bạn đã báo chuyển khoản cho đơn này. Link tải sẽ được gửi tới <b>' + esc(o.email) + '</b> trong vòng 24 giờ sau khi xác nhận thanh toán.';
      } else {
        note = (st === 'unpaid'
          ? '<span class="sp-note-warn"><i class="bi bi-exclamation-circle"></i> Mình chưa thấy khoản chuyển cho đơn này.</span> Nếu bạn đã chuyển, kiểm tra lại số tiền và nội dung rồi bấm nút bên dưới lần nữa. '
          : 'Chuyển khoản đúng số tiền và nội dung, rồi bấm nút bên dưới. ') +
          'Link tải sẽ được gửi tới <b>' + esc(a ? a.email : o.email) + '</b> trong vòng 24 giờ sau khi xác nhận thanh toán.';
        btns = '<button type="button" class="btn btn-primary w-100" data-order="report"' + (busy ? ' disabled' : '') + '><i class="bi bi-send-check"></i> Đã chuyển khoản</button>' +
          (st === 'pending' ? '<button type="button" class="sp-link-btn" data-order="cancel"' + (busy ? ' disabled' : '') + '>Tôi chưa mua, hủy đơn này</button>' : '');
      }
      pay.extra.innerHTML = '<div class="sp-deliver"><p class="sp-deliver-note">' + note + '</p>' + btns +
        (errText ? '<p class="sp-gate-error">' + errText + '</p>' : '') + '</div>';
    }

    /* Nhắc đơn chờ thanh toán: chấm cam ở lối vào + dòng nhắc trong cửa sổ */
    function renderRemind() {
      var list = signedIn() ? Orders.due() : [];
      document.documentElement.classList.toggle('sp-order-due', list.length > 0);
      remind.innerHTML = list.map(function (p) {
        var o = Orders.get(p.id);
        return '<div class="callout callout-amber sp-remind-item">' +
          '<div><i class="bi bi-bell"></i> Đơn <b>' + esc(p.name) + '</b> (' + vnd(o.price) + ', nội dung <b class="sp-mono">' + esc(o.transfer) + '</b>) ' +
          'đang chờ thanh toán từ ' + when(Orders.ms(o.createdAt)) + '. Nếu bạn đã chuyển khoản, bấm <b>Đã chuyển khoản</b> để mình gửi tài liệu.</div>' +
          '<div class="sp-remind-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-order="report" data-pid="' + esc(p.id) + '">Đã chuyển khoản</button>' +
            '<button type="button" class="btn btn-soft btn-sm" data-order="cancel" data-pid="' + esc(p.id) + '">Tôi chưa mua</button>' +
          '</div></div>';
      }).join('');
      clearTimeout(remindTimer);
      var t = Orders.nextCheck();
      if (t) remindTimer = setTimeout(function () { renderRemind(); }, t + 1000);
    }

    function renderAll() { renderList(); renderPay(); renderRemind(); }

    /** Mở cửa sổ / đổi gói / vừa đăng nhập: tải đơn rồi bảo đảm gói đang chọn có đơn chờ thanh toán */
    /** reopen: người mua bấm "Mua gói này" trên đơn đã hủy / quá hạn (mở cửa sổ thì không tự mở lại, tránh nhắc lặp) */
    function refresh(reopen) {
      var t = ++token;
      errText = ''; peek = false;
      if (!signedIn()) {
        var c = cloud(), waiting = c && c.mode && c.mode() === 'user' && !c.info().authResolved;
        view = waiting ? 'loading' : 'signin';
        return renderAll();
      }
      view = 'loading'; renderPay();
      Orders.load().then(function () {
        if (t !== token) return;
        if (pickOnLoad) {
          // Vừa mở cửa sổ: chọn sẵn gói đang có đơn cần xử lý (chờ thanh toán quá 10 phút / đã báo chuyển khoản)
          pickOnLoad = false;
          var pick = Orders.due()[0] || PRODUCTS.filter(function (p) { return Orders.state(p.id) === 'reported'; })[0];
          if (pick) product = pick;
        }
        var st = Orders.state(product.id);
        if (st === 'sent' || st === 'reported' || st === 'unpaid') return null;
        if ((st === 'cancelled' || st === 'expired') && !reopen) return null;
        return Orders.ensure(product);
      }).then(function () {
        if (t !== token) return;
        view = 'order'; renderAll();
      }).catch(function (e) {
        if (t !== token) return;
        console.warn('[orders]', e);
        view = 'error';
        errText = e && e.code === 'permission-denied'
          ? 'Chưa tạo được đơn (máy chủ từ chối). Bạn thử lại sau ít phút nhé.'
          : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
        renderAll();
      });
    }

    function act(kind, pid) {
      var p = PRODUCTS.filter(function (x) { return x.id === (pid || product.id); })[0];
      if (!p || busy) return;
      var o = Orders.get(p.id);
      if (kind === 'report' && !window.confirm('Bạn đã chuyển ' + vnd(o.price) + ' với nội dung "' + o.transfer + '"?\n\nBấm OK để báo cho mình kiểm tra và gửi tài liệu.')) return;
      busy = true; errText = ''; renderPay();
      (kind === 'report' ? Orders.report(p.id) : Orders.cancel(p.id)).then(function () {
        busy = false; peek = false;
        if (kind === 'report' && p !== product) { product = p; }
        renderAll();
      }).catch(function (e) {
        console.warn('[orders]', e);
        busy = false;
        errText = 'Chưa lưu được, kiểm tra mạng rồi thử lại.';
        renderAll();
      });
    }

    modal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-order]');
      if (!b) return;
      var k = b.dataset.order;
      if (k === 'signin') {
        errText = '';
        var p;
        try { p = cloud().signIn(); } catch (err) { p = Promise.reject(err); }
        p.catch(function (err) {
          if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
          errText = 'Đăng nhập chưa thành công, vui lòng thử lại.';
          renderPay();
        });
      } else if (k === 'retry') refresh();
      else if (k === 'reopen') refresh(true);
      else if (k === 'peek') { peek = true; renderPay(); }
      else act(k, b.dataset.pid);
    });
    modal.addEventListener('change', function (e) {
      if (e.target.name !== 'sp-product') return;
      product = PRODUCTS.filter(function (p) { return p.id === e.target.value; })[0] || product;
      $$('.sp-product', modal).forEach(function (l) { l.classList.toggle('active', l.contains(e.target)); });
      refresh();
    });
    modal.addEventListener('show.bs.modal', function () { pickOnLoad = true; refresh(); });
    // Đăng nhập / đăng xuất / vừa khôi phục phiên → tải lại đơn để hiện chấm nhắc ở lối vào
    var lastUid = null;
    window.addEventListener('authchange', function () {
      var a = Orders.account(), id = a ? a.uid : '';
      if (id === lastUid) return;
      lastUid = id;
      if (modal.classList.contains('show')) return refresh();
      if (!a) return renderRemind();
      Orders.load().then(renderRemind).catch(function (e) { console.warn('[orders]', e); });
    });
    renderList();
  }

  /* ============================================================
   * Modal 2: Mời tác giả ly trà
   * ============================================================ */
  function initDonate(modal) {
    var pay = PayPanel($('.sp-pay', modal), modal);
    var tier = TIERS.filter(function (t) { return t.default; })[0] || TIERS[0];
    var custom = '';
    var input = $('.sp-custom-input', modal);

    function renderTiers() {
      $('.sp-tiers', modal).innerHTML = TIERS.map(function (t, i) {
        var on = t === tier;
        return '<button type="button" class="sp-tier' + (on ? ' active' : '') + '" data-tier="' + i + '" aria-pressed="' + on + '">' +
          (t.badge ? '<span class="sp-tier-badge">' + esc(t.badge) + '</span>' : '') +
          '<span class="sp-tier-amt">' + (t.amount == null ? esc(t.label.replace(/^\S+\s/, '')) : short(t.amount)) + '</span>' +
          '<span class="sp-tier-label">' + (t.amount == null ? esc(t.label.split(' ')[0]) + ' từ ' + short(MIN) : esc(t.label)) + '</span>' +
        '</button>';
      }).join('');
      $('.sp-custom', modal).classList.toggle('d-none', tier.amount != null);
    }
    function renderPay() {
      var amt = tier.amount == null ? parseInt(custom, 10) || 0 : tier.amount;
      var invalid = amt < MIN;
      $('.sp-error', modal).classList.toggle('d-none', !(tier.amount == null && custom !== '' && invalid));
      var forText = 'Mời tác giả ' + (tier.amount == null ? 'một ly trà' : tier.label.replace(/^\S+\s/, ''));
      pay.update(invalid ? 0 : amt, C.DONATE_MESSAGE || 'Ung ho duy tri web', forText);
    }

    modal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tier]');
      if (!b) return;
      tier = TIERS[+b.dataset.tier];
      renderTiers(); renderPay();
      if (tier.amount == null) input.focus();
    });
    input.addEventListener('input', function () {
      var digits = input.value.replace(/\D/g, '').slice(0, 9);
      custom = digits;
      input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
      renderPay();
    });
    $('.sp-min', modal).textContent = vnd(MIN);
    renderTiers();
    renderPay();
  }

  /* ---------- Mở modal ---------- */
  var MODALS = { resources: 'resources-modal', donate: 'donate-modal' };
  function open(kind) {
    if (!visible) return;
    var el = document.getElementById(MODALS[kind === 'donate' ? 'donate' : 'resources']);
    if (el) bootstrap.Modal.getOrCreateInstance(el).show();
  }

  function init() {
    $$('.sp-demo').forEach(function (el) { el.classList.toggle('d-none', !placeholder); });
    var r = document.getElementById('resources-modal'), d = document.getElementById('donate-modal');
    if (r) initResources(r);
    if (d) initDonate(d);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-support-open]');
    if (!el) return;
    e.preventDefault();
    var kind = el.dataset.supportOpen;
    // Đang mở một modal khác (vd. màn chúc mừng) → đóng xong mới mở
    var shown = document.querySelector('.modal.show');
    if (shown && shown.id !== MODALS[kind]) {
      shown.addEventListener('hidden.bs.modal', function () { open(kind); }, { once: true });
      bootstrap.Modal.getOrCreateInstance(shown).hide();
    } else open(kind);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Support = { visible: visible, placeholder: placeholder, open: open };
})();
