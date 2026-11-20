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
  function orderCode() {
    var n = 0;
    try { n = crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { n = Math.floor(Math.random() * 1e9); }
    return String(1000 + n % 9000);
  }
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
   * Modal 1: Tài liệu học tập
   * ============================================================ */
  function initResources(modal) {
    var pay = PayPanel($('.sp-pay', modal), modal);
    var product = PRODUCTS.filter(function (p) { return p.default; })[0] || PRODUCTS[PRODUCTS.length - 1];
    var code = orderCode();

    pay.extra.innerHTML =
      '<div class="sp-deliver"><p class="sp-deliver-note"></p>' +
      '<a class="btn btn-primary w-100" href="#" target="_blank" rel="noopener"></a></div>';

    function renderList() {
      $('.sp-products', modal).innerHTML = PRODUCTS.map(function (p) {
        var on = p === product;
        return '<label class="sp-product' + (on ? ' active' : '') + '">' +
          '<input type="radio" name="sp-product" value="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="sp-product-icon"><i class="bi ' + esc(p.icon || 'bi-file-earmark') + '"></i></span>' +
          '<span class="sp-product-body">' +
            '<span class="sp-product-top">' +
              '<span class="sp-product-name">' + esc(p.name) + '</span>' +
              (p.badge ? '<span class="sp-badge' + (p.default ? ' sp-badge-jade' : '') + '">' + esc(p.badge) + '</span>' : '') +
            '</span>' +
            '<span class="sp-product-desc">' + esc(p.description) + '</span>' +
            '<span class="sp-product-foot">' +
              (p.format ? '<span class="sp-format">' + esc(p.format) + '</span>' : '') +
              '<span class="sp-price">' + vnd(p.price) + (p.originalPrice ? ' <s>' + vnd(p.originalPrice) + '</s>' : '') + '</span>' +
            '</span>' +
          '</span>' +
          '<span class="sp-check" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
        '</label>';
      }).join('');
    }
    function renderPay() {
      pay.update(product.price, 'Tai lieu ' + product.codePrefix + ' ' + code, product.name);
      var direct = !!product.deliveryLink;
      $('.sp-deliver-note', modal).innerHTML = direct
        ? 'Sau khi chuyển khoản, bấm nút bên dưới để nhận link tải file ngay lập tức.'
        : 'Sau khi chuyển khoản, bấm nút bên dưới và nhắn mã đơn <b>' + esc(product.codePrefix + ' ' + code) + '</b> để nhận link tải file ngay.';
      var btn = $('.sp-deliver .btn', modal);
      btn.href = direct ? product.deliveryLink : P.contactLink;
      btn.innerHTML = '<i class="bi ' + (direct ? 'bi-cloud-arrow-down' : 'bi-chat-dots') + '"></i> Đã chuyển khoản · Nhận tài liệu';
    }

    modal.addEventListener('change', function (e) {
      if (e.target.name !== 'sp-product') return;
      product = PRODUCTS.filter(function (p) { return p.id === e.target.value; })[0] || product;
      code = orderCode();
      $$('.sp-product', modal).forEach(function (l) { l.classList.toggle('active', l.contains(e.target)); });
      renderPay();
    });
    modal.addEventListener('show.bs.modal', function () { code = orderCode(); renderPay(); });   // mỗi lần mở: mã đơn mới
    renderList();
    renderPay();
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
