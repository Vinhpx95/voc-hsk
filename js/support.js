/*
 * "Tài liệu & Ủng hộ" (#support-modal) — bán tài liệu số giá rẻ + mời tác giả ly trà, thanh toán qua VietQR.
 * Cấu hình ở js/support-config.js. Mở modal: phần tử bất kỳ có data-support-open="products" | "donate".
 *
 * Khi thông tin chuyển khoản còn là mẫu, các nút mở modal (.support-entry) tự ẩn trên trang thật,
 * chỉ hiện ở localhost để xem thử.
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
  var visible = !placeholder || local;
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

  /* ---------- Trạng thái ---------- */
  var defProduct = PRODUCTS.filter(function (p) { return p.default; })[0] || PRODUCTS[PRODUCTS.length - 1];
  var defTier = TIERS.filter(function (t) { return t.default; })[0] || TIERS[0];
  var state = {
    tab: 'products',
    product: defProduct,
    code: orderCode(),
    tier: defTier,
    custom: ''
  };

  function current() {
    if (state.tab === 'products') {
      var p = state.product;
      return { amount: p.price, message: 'Tai lieu ' + p.codePrefix + ' ' + state.code };
    }
    var amt = state.tier.amount == null ? parseInt(String(state.custom).replace(/\D/g, ''), 10) || 0 : state.tier.amount;
    return { amount: amt, message: C.DONATE_MESSAGE || 'Ung ho duy tri web', invalid: amt < MIN };
  }

  function qrUrl(amount, message) {
    return 'https://img.vietqr.io/image/' + encodeURIComponent(P.bankId) + '-' + encodeURIComponent(P.accountNo) +
      '-compact2.png?amount=' + amount + '&addInfo=' + encodeURIComponent(message) +
      '&accountName=' + encodeURIComponent(P.accountName);
  }

  /* ---------- Vẽ danh sách ---------- */
  function renderProducts() {
    $('#sp-products').innerHTML = PRODUCTS.map(function (p) {
      var on = p === state.product;
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
            '<span class="sp-price">' + vnd(p.price) +
              (p.originalPrice ? ' <s>' + vnd(p.originalPrice) + '</s>' : '') + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="sp-check" aria-hidden="true"><i class="bi bi-check-lg"></i></span>' +
      '</label>';
    }).join('');
  }

  function renderTiers() {
    $('#sp-tiers').innerHTML = TIERS.map(function (t, i) {
      var on = t === state.tier;
      return '<button type="button" class="sp-tier' + (on ? ' active' : '') + '" data-tier="' + i + '" aria-pressed="' + on + '">' +
        (t.badge ? '<span class="sp-tier-badge">' + esc(t.badge) + '</span>' : '') +
        '<span class="sp-tier-amt">' + (t.amount == null ? esc(t.label) : short(t.amount)) + '</span>' +
        '<span class="sp-tier-label">' + (t.amount == null ? 'từ ' + short(MIN) : esc(t.label)) + '</span>' +
      '</button>';
    }).join('');
    var custom = state.tier.amount == null;
    $('#sp-custom').classList.toggle('d-none', !custom);
  }

  /* ---------- Khu vực QR (chung 2 tab) ---------- */
  var qrToken = 0;
  function renderPay() {
    var cur = current(), isProd = state.tab === 'products';
    var img = $('#sp-qr-img'), frame = $('#sp-qr');
    $('#sp-amount').textContent = cur.amount ? vnd(cur.amount) : '—';
    $('#sp-message').textContent = cur.message;
    $('#sp-for').textContent = isProd ? state.product.name : 'Mời tác giả ' + (state.tier.amount == null ? 'một ly trà' : state.tier.label.replace(/^\S+\s/, ''));
    $('#sp-custom-error').classList.toggle('d-none', !(state.tab === 'donate' && state.tier.amount == null && state.custom !== '' && cur.invalid));

    var ok = !cur.invalid && cur.amount > 0;
    frame.classList.toggle('is-empty', !ok);
    if (!ok) frame.classList.remove('is-loading', 'is-error');
    $('#btn-sp-download').disabled = !ok;
    if (ok) {
      var url = qrUrl(cur.amount, cur.message);
      if (img.dataset.src !== url) {
        var token = ++qrToken;
        frame.classList.add('is-loading');
        frame.classList.remove('is-error');
        img.onload = function () { if (token === qrToken) frame.classList.remove('is-loading'); };
        img.onerror = function () { if (token === qrToken) { frame.classList.remove('is-loading'); frame.classList.add('is-error'); } };
        img.dataset.src = url;
        img.src = url;
        img.alt = 'Mã VietQR chuyển ' + vnd(cur.amount) + ' — nội dung: ' + cur.message;
        pngCache = null;
      }
    }

    // Nhận tài liệu (chỉ tab Tài liệu)
    $('#sp-deliver').classList.toggle('d-none', !isProd);
    if (isProd) {
      var direct = !!state.product.deliveryLink;
      $('#sp-deliver-note').innerHTML = direct
        ? 'Sau khi chuyển khoản, bấm nút bên dưới để nhận link tải file ngay lập tức.'
        : 'Sau khi chuyển khoản, bấm nút bên dưới và nhắn mã đơn <b>' + esc(state.product.codePrefix + ' ' + state.code) + '</b> để nhận link tải file ngay.';
      var btn = $('#btn-sp-deliver');
      btn.href = direct ? state.product.deliveryLink : P.contactLink;
      btn.innerHTML = '<i class="bi ' + (direct ? 'bi-cloud-arrow-down' : 'bi-chat-dots') + '"></i> Đã chuyển khoản · Nhận tài liệu';
    }
  }

  function renderAll() {
    $$('#support-modal [data-sp-tab]').forEach(function (b) {
      var on = b.dataset.spTab === state.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $('#sp-pane-products').classList.toggle('d-none', state.tab !== 'products');
    $('#sp-pane-donate').classList.toggle('d-none', state.tab !== 'donate');
    renderPay();
  }

  /* ---------- Tải ảnh QR (PNG để app ngân hàng quét từ thư viện ảnh) ---------- */
  var pngCache = null;   // { url, promise }
  function qrPng() {
    var url = $('#sp-qr-img').dataset.src;
    if (pngCache && pngCache.url === url) return pngCache.promise;
    function get(u) {
      return fetch(u).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      });
    }
    // Link .png của VietQR chuyển hướng (301) sang .svg nhưng bước chuyển hướng thiếu CORS → gọi thẳng .svg trước
    var promise = get(url.replace('-compact2.png', '-compact2.svg')).catch(function () { return get(url); }).then(function (blob) {
      if (/png/.test(blob.type)) return blob;
      // VietQR trả SVG → vẽ lại thành PNG (ảnh nhúng sẵn trong SVG nên canvas không bị "bẩn")
      return new Promise(function (resolve, reject) {
        var src = URL.createObjectURL(blob), im = new Image();
        im.onload = function () {
          var w = im.naturalWidth || 540, h = im.naturalHeight || 640, s = 2;
          var cv = document.createElement('canvas');
          cv.width = w * s; cv.height = h * s;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(im, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(src);
          cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
        };
        im.onerror = function () { URL.revokeObjectURL(src); reject(new Error('svg')); };
        im.src = src;
      });
    });
    pngCache = { url: url, promise: promise };
    promise.catch(function () { if (pngCache && pngCache.promise === promise) pngCache = null; });
    return promise;
  }
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function downloadQr() {
    var cur = current(), name = 'voc-lang-qr-' + cur.amount + '.png';
    var btn = $('#btn-sp-download'), label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang tạo ảnh…';
    qrPng().then(function (blob) {
      var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
      // iPhone/iPad: tệp tải về nằm trong app Tệp, app ngân hàng không thấy → dùng bảng chia sẻ để "Lưu hình ảnh"
      if (isIOS && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file] }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          saveBlob(blob, name);
        });
      }
      saveBlob(blob, name);
      btn.innerHTML = label;
      flash(btn, '<i class="bi bi-check2-circle"></i> Đã tải ảnh QR');
      return 'flashed';
    }).catch(function () {
      // Không tạo được PNG → mở ảnh gốc ở thẻ mới để giữ lâu và lưu
      window.open($('#sp-qr-img').dataset.src, '_blank', 'noopener');
    }).then(function (r) {
      btn.disabled = false;
      if (r !== 'flashed') btn.innerHTML = label;
    });
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

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

  /* ---------- Mở modal ---------- */
  function open(tab) {
    if (!visible) return;
    state.tab = tab === 'donate' ? 'donate' : 'products';
    renderAll();
    bootstrap.Modal.getOrCreateInstance($('#support-modal')).show();
  }

  function init() {
    var modal = $('#support-modal');
    if (!modal) return;
    $('#sp-demo').classList.toggle('d-none', !placeholder);
    $('#sp-bank').textContent = P.bankName || P.bankId;
    $('#sp-account').textContent = P.accountNo;
    $('#sp-holder').textContent = P.accountName;
    $('#sp-min').textContent = vnd(MIN);
    renderProducts();
    renderTiers();

    modal.addEventListener('click', function (e) {
      var t = e.target.closest('[data-sp-tab]');
      if (t) { state.tab = t.dataset.spTab; renderAll(); return; }
      var tier = e.target.closest('[data-tier]');
      if (tier) {
        state.tier = TIERS[+tier.dataset.tier];
        renderTiers(); renderPay();
        if (state.tier.amount == null) $('#sp-custom-input').focus();
        return;
      }
      if (e.target.closest('#btn-sp-download')) { downloadQr(); return; }
      var cp = e.target.closest('[data-copy]');
      if (cp) {
        var text = cp.dataset.copy === 'account' ? P.accountNo : current().message;
        copyText(text).then(function () {
          flash(cp, cp.dataset.copy === 'account' ? '<i class="bi bi-check2-circle"></i> Đã sao chép!' : '<i class="bi bi-check2"></i>');
        }, function () {
          // Không sao chép được (trình duyệt chặn) → bôi đen sẵn để người dùng tự sao chép
          var target = $(cp.dataset.copy === 'account' ? '#sp-account' : '#sp-message');
          var range = document.createRange(), sel = window.getSelection();
          range.selectNodeContents(target); sel.removeAllRanges(); sel.addRange(range);
          flash(cp, cp.dataset.copy === 'account' ? '<i class="bi bi-hand-index"></i> Nhấn giữ để sao chép' : '<i class="bi bi-hand-index"></i>');
        });
      }
    });
    modal.addEventListener('change', function (e) {
      if (e.target.name !== 'sp-product') return;
      state.product = PRODUCTS.filter(function (p) { return p.id === e.target.value; })[0] || state.product;
      state.code = orderCode();
      $$('.sp-product', modal).forEach(function (l) { l.classList.toggle('active', l.contains(e.target)); });
      renderPay();
    });
    var input = $('#sp-custom-input');
    input.addEventListener('input', function () {
      var digits = input.value.replace(/\D/g, '').slice(0, 9);
      state.custom = digits;
      input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
      renderPay();
    });
    // Mỗi lần mở lại: mã đơn mới cho gói đang chọn
    modal.addEventListener('show.bs.modal', function () { state.code = orderCode(); renderPay(); });
    // Ảnh QR đã hiện → chuẩn bị sẵn PNG để nút "Tải ảnh" phản hồi ngay (iPhone cần thao tác người dùng còn "nóng")
    $('#sp-qr-img').addEventListener('load', function () { if (modal.classList.contains('show')) qrPng().catch(function () {}); });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-support-open]');
    if (!el) return;
    e.preventDefault();
    var tab = el.dataset.supportOpen;
    // Đang mở một modal khác (vd. tổng kết buổi học) → đóng xong mới mở
    var shown = document.querySelector('.modal.show');
    if (shown && shown.id !== 'support-modal') {
      shown.addEventListener('hidden.bs.modal', function () { open(tab); }, { once: true });
      bootstrap.Modal.getOrCreateInstance(shown).hide();
    } else open(tab);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Support = { visible: visible, placeholder: placeholder, open: open };
})();
