/*
 * Voc-Lang — Google Apps Script gửi tài liệu cho người mua (giai đoạn 6.4). Hướng dẫn: tools/apps-script/HUONG-DAN.md
 *
 * Chạy bằng tài khoản Google của chủ trang (tài khoản admin, có quyền Owner / Editor trong dự án Firebase voc-lang-hsk),
 * nên đọc / ghi Firestore qua REST bằng quyền IAM của tài khoản đó (không đi qua Firestore Rules).
 *
 *   notifyNewOrders()  trigger 5 phút / lần: đơn vừa "đã báo chuyển khoản" → gửi 1 email báo chủ trang, ghi notifiedAt
 *   doGet ?action=send&id=<uid_productId>
 *                      trang xác nhận → tạo link R2 có hạn 24 giờ + thư nháp Gmail cho người mua, ghi đơn "đã gửi",
 *                      rồi bấm "Gửi luôn" hoặc mở thư nháp để sửa trước khi gửi
 *   doGet ?action=test kiểm tra cấu hình: đọc Firestore, link tải 3 gói
 *   setup()            chạy 1 lần trong trình soạn thảo: tạo trigger 5 phút + kiểm tra
 *
 * Khóa R2 (chỉ đọc) nằm trong Project Settings → Script Properties, KHÔNG ghi vào file này:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   tùy chọn: OWNER_EMAIL  (nhận thư báo đơn mới; mặc định là tài khoản chạy script)
 *             SENDER_EMAIL (thư gửi người mua đi từ địa chỉ này và người mua trả lời về đây; phải thêm trước trong
 *                           Gmail → Cài đặt → Tài khoản và Nhập → Gửi thư bằng địa chỉ)
 */
var PROJECT_ID = 'voc-lang-hsk';
var ADMIN_URL = 'https://voclanghsk.com/admin-report/';
var APP_URL = 'https://voclanghsk.com/';
var LINK_HOURS = 24;
var TZ = 'Asia/Ho_Chi_Minh';
var FILES = {
  hsk13: { key: 'Goi-1-Vo-luyen-viet-HSK1-3.zip', size: '~10 MB', what: 'Vở luyện viết HSK 1–3 (3 file PDF)' },
  audio: { key: 'Goi-2-Audio-HSK1-6.zip', size: '~610 MB', what: 'Audio HSK 1–6 (228 bài MP3) + PDF danh sách từ' },
  combo: { key: 'Goi-3-Combo-HSK1-6.zip', size: '~640 MB', what: 'Vở luyện viết HSK 1–6 + audio HSK 1–6 + Sổ tay 214 bộ thủ' }
};

/* ============================================================
 * Tiện ích
 * ============================================================ */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function ownerEmail_() { return prop_('OWNER_EMAIL') || Session.getEffectiveUser().getEmail(); }
function senderEmail_() { return prop_('SENDER_EMAIL').trim().toLowerCase(); }
/** SENDER_EMAIL đã được thêm vào "Gửi thư bằng địa chỉ" của Gmail chưa (GmailApp chỉ gửi được từ các bí danh này) */
function senderReady_(s) {
  return GmailApp.getAliases().some(function (a) { return String(a).toLowerCase() === s; });
}
/** Tùy chọn cho thư gửi người mua: tên Voc-Lang-HSK; có SENDER_EMAIL thì gửi từ địa chỉ đó và người mua trả lời về đó */
function buyerMailOptions_(html) {
  var opt = { htmlBody: html, name: 'Voc-Lang-HSK' }, s = senderEmail_();
  if (s) {
    if (!senderReady_(s)) throw new Error('Gmail chưa có địa chỉ gửi ' + s + '. Thêm trong Gmail → Cài đặt → Tài khoản và Nhập → Gửi thư bằng địa chỉ, hoặc xóa SENDER_EMAIL trong Script Properties.');
    opt.from = s;
    opt.replyTo = s;
  }
  return opt;
}
function fmt_(d) { return d ? Utilities.formatDate(d, TZ, 'HH:mm dd/MM/yyyy') : ''; }
function vnd_(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'; }
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
/** Chỉ chủ script mới gọi được các hàm gửi (Web app đã đặt "Only myself", đây là lớp kiểm tra thứ hai) */
function assertOwner_() {
  var a = Session.getActiveUser().getEmail(), b = Session.getEffectiveUser().getEmail();
  if (!a || a !== b) throw new Error('Chỉ chủ script được dùng chức năng này.');
}

/* ============================================================
 * Firestore REST (quyền của tài khoản chạy script)
 * ============================================================ */
var FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
function fs_(path, opt) {
  opt = opt || {};
  var res = UrlFetchApp.fetch(FS + path, {
    method: opt.method || 'get',
    contentType: 'application/json',
    payload: opt.payload,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID }
  });
  var code = res.getResponseCode(), text = res.getContentText();
  if (code === 404 && opt.allow404) return null;
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + text.slice(0, 400));
  return JSON.parse(text || '{}');
}
function val_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('booleanValue' in v) return v.booleanValue;
  return null;
}
function doc_(d) {
  var o = { id: d.name.split('/').pop() };
  Object.keys(d.fields || {}).forEach(function (k) { o[k] = val_(d.fields[k]); });
  return o;
}
function getOrder_(id) {
  if (!/^[A-Za-z0-9]+_(hsk13|audio|combo)$/.test(id || '')) return null;
  var d = fs_('/orders/' + id, { allow404: true });
  return d ? doc_(d) : null;
}
function ordersWithStatus_(status) {
  var rows = fs_(':runQuery', {
    method: 'post',
    payload: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } }
    } })
  });
  return rows.filter(function (r) { return r.document; }).map(function (r) { return doc_(r.document); });
}
/** Ghi một số trường của đơn (chuỗi, số, Date) — chỉ khi đơn đã tồn tại */
function patch_(id, data) {
  var fields = {}, mask = [];
  Object.keys(data).forEach(function (k) {
    var v = data[k];
    mask.push('updateMask.fieldPaths=' + k);
    fields[k] = v instanceof Date ? { timestampValue: v.toISOString() }
      : typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) };
  });
  return fs_('/orders/' + id + '?' + mask.join('&') + '&currentDocument.exists=true',
    { method: 'patch', payload: JSON.stringify({ fields: fields }) });
}

/* ============================================================
 * Link tải R2 ký sẵn (AWS Signature V4, giống tools/tai-lieu/r2.js)
 * ============================================================ */
function bytes_(s) { return Utilities.newBlob(s).getBytes(); }
function hex_(b) { return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function hmac_(key, msg) { return Utilities.computeHmacSha256Signature(bytes_(msg), typeof key === 'string' ? bytes_(key) : key); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function enc_(s) { return encodeURIComponent(s).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); }
function presign_(key, hours, now) {
  var ACCOUNT = prop_('R2_ACCOUNT_ID'), AK = prop_('R2_ACCESS_KEY_ID'), SK = prop_('R2_SECRET_ACCESS_KEY'), BUCKET = prop_('R2_BUCKET');
  if (!ACCOUNT || !AK || !SK || !BUCKET) throw new Error('Thiếu R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET trong Script Properties.');
  var host = ACCOUNT + '.r2.cloudflarestorage.com';
  var amz = (now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), day = amz.slice(0, 8);
  var scope = day + '/auto/s3/aws4_request';
  var path = '/' + enc_(BUCKET) + '/' + key.split('/').map(enc_).join('/');
  var q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': AK + '/' + scope, 'X-Amz-Date': amz,
    'X-Amz-Expires': String(Math.round(hours * 3600)), 'X-Amz-SignedHeaders': 'host',
    'response-content-disposition': 'attachment; filename="' + key.replace(/[^\x20-\x7e]/g, '_') + '"'
  };
  var query = Object.keys(q).sort().map(function (k) { return enc_(k) + '=' + enc_(q[k]); }).join('&');
  var canon = ['GET', path, query, 'host:' + host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  var toSign = ['AWS4-HMAC-SHA256', amz, scope, sha_(canon)].join('\n');
  var k = hmac_(hmac_(hmac_(hmac_('AWS4' + SK, day), 'auto'), 's3'), 'aws4_request');
  return 'https://' + host + path + '?' + query + '&X-Amz-Signature=' + hex_(hmac_(k, toSign));
}

/* ============================================================
 * 1. Báo đơn mới cho chủ trang (trigger 5 phút)
 * ============================================================ */
function notifyNewOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var fresh = ordersWithStatus_('reported').filter(function (o) {
      return !o.notifiedAt || (o.reportedAt && o.reportedAt > o.notifiedAt);
    });
    if (!fresh.length) return;
    var rows = fresh.map(function (o) {
      return '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>' + esc_(o.code) + '</b><br><span style="color:#6b7280">' + esc_(o.transfer) + '</span></td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc_(o.productName) + '<br><b>' + vnd_(o.price) + '</b></td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc_(o.email) + '<br><span style="color:#6b7280">báo lúc ' + fmt_(o.reportedAt) + '</span></td></tr>';
    }).join('');
    var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">' +
      '<p>Có <b>' + fresh.length + ' đơn</b> vừa bấm "Đã chuyển khoản". Bạn kiểm tra tài khoản ngân hàng (số tiền + nội dung), rồi vào trang quản trị bấm <b>Gửi tài liệu</b>.</p>' +
      '<table style="border-collapse:collapse;font-size:14px">' + rows + '</table>' +
      '<p><a href="' + ADMIN_URL + '#q=' + encodeURIComponent(fresh[0].code) + '" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none">Mở trang quản trị</a></p>' +
      '<p style="color:#6b7280;font-size:12px">Email tự động từ Apps Script Voc-Lang (kiểm tra 5 phút / lần).</p></div>';
    GmailApp.sendEmail(ownerEmail_(), 'Voc-Lang: ' + fresh.length + ' đơn báo chuyển khoản (' + fresh.map(function (o) { return o.code; }).join(', ') + ')',
      fresh.map(function (o) { return o.code + ' · ' + o.productName + ' · ' + vnd_(o.price) + ' · ' + o.email; }).join('\n') + '\n\n' + ADMIN_URL,
      { htmlBody: html, name: 'Voc-Lang-HSK' });
    var now = new Date();
    fresh.forEach(function (o) { patch_(o.id, { notifiedAt: now }); });
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 2. Gửi tài liệu: trang xác nhận → thư nháp có link 24 giờ → Gửi luôn / mở thư nháp
 * ============================================================ */
function buyerMail_(o, url, expires) {
  var f = FILES[o.productId], name = o.name || 'bạn';
  var subject = 'Voc-Lang: link tải ' + o.productName;
  var plain = 'Chào ' + name + ',\n\n' +
    'Cảm ơn bạn đã mua "' + o.productName + '" trên Voc-Lang (mã đơn ' + o.code + '). Mình đã nhận được thanh toán.\n\n' +
    'Link tải (' + f.what + ', file zip ' + f.size + '):\n' + url + '\n\n' +
    'Link dùng được trong 24 giờ, đến ' + fmt_(expires) + '. Bạn tải về và lưu lại ngay nhé.\n' +
    'Giải nén file zip, rồi mở file 00-Doc-truoc.pdf trước để biết cách in và cách nghe.\n\n' +
    'Chúc bạn học tốt!\nVoc-Lang-HSK · ' + APP_URL;
  var html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">' +
    '<p>Chào ' + esc_(name) + ',</p>' +
    '<p>Cảm ơn bạn đã mua <b>' + esc_(o.productName) + '</b> trên Voc-Lang (mã đơn <b>' + esc_(o.code) + '</b>). Mình đã nhận được thanh toán.</p>' +
    '<p style="margin:22px 0"><a href="' + esc_(url) + '" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold">Tải tài liệu (' + esc_(f.size) + ')</a></p>' +
    '<p style="color:#4b5563;font-size:14px">' + esc_(f.what) + '.<br>Link dùng được trong <b>24 giờ</b>, đến <b>' + fmt_(expires) + '</b>. Bạn tải về và lưu lại ngay nhé.</p>' +
    '<p>Giải nén file zip, rồi mở file <b>00-Doc-truoc.pdf</b> trước để biết cách in và cách nghe.</p>' +
    '<p>Chúc bạn học tốt!<br>Voc-Lang-HSK · <a href="' + APP_URL + '" style="color:#0f766e">' + APP_URL + '</a></p></div>';
  return { subject: subject, plain: plain, html: html };
}

/** Gọi từ trang xác nhận (google.script.run): tạo thư nháp + ghi đơn "đã gửi" */
function createDraft(id) {
  assertOwner_();
  var o = getOrder_(id);
  if (!o) throw new Error('Không tìm thấy đơn ' + id);
  if (o.status === 'cancelled') throw new Error('Đơn đã hủy. Mở lại đơn trên trang quản trị trước khi gửi.');
  var f = FILES[o.productId];
  var opt = buyerMailOptions_('');   // kiểm tra địa chỉ gửi trước khi tạo link và ghi đơn
  var now = new Date(), expires = new Date(now.getTime() + LINK_HOURS * 3600 * 1000);
  var url = presign_(f.key, LINK_HOURS, now);
  var m = buyerMail_(o, url, expires);
  opt.htmlBody = m.html;
  var draft = GmailApp.createDraft(o.email, m.subject, m.plain, opt);
  patch_(o.id, { status: 'sent', sentAt: now, updatedAt: now });
  return {
    draftId: draft.getId(),
    draftUrl: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(Session.getEffectiveUser().getEmail()) + '#drafts?compose=' + draft.getMessage().getId(),
    email: o.email, expires: fmt_(expires)
  };
}
/** "Gửi luôn" thư nháp vừa tạo */
function sendDraft(draftId) {
  assertOwner_();
  GmailApp.getDraft(draftId).send();
  return true;
}

var PAGE_STYLE = '<style>body{font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#1f2937;font-size:15px;line-height:1.5}' +
  'h1{font-size:20px}.card{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:14px 0}.muted{color:#6b7280;font-size:13px}' +
  '.warn{background:#fef3c7;border-radius:10px;padding:10px 12px}.err{background:#ffe4e6;border-radius:10px;padding:10px 12px}.ok{background:#ecfdf5;border-radius:10px;padding:10px 12px}' +
  'button,a.btn{display:inline-block;margin:6px 6px 0 0;padding:11px 16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-size:15px;text-decoration:none;cursor:pointer}' +
  'button.soft,a.soft{background:#e5e7eb;color:#1f2937}button:disabled{opacity:.6}</style>';

function page_(title, body) {
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><base target="_top">' + PAGE_STYLE + '</head><body>' + body + '</body></html>')
    .setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    assertOwner_();
    if (p.action === 'send') return sendPage_(p.id);
    if (p.action === 'test') return page_('Kiểm tra cấu hình', '<h1>Kiểm tra cấu hình</h1>' + checks_().map(function (c) {
      return '<p class="' + (c[0] ? 'ok' : 'err') + '">' + (c[0] ? '✔ ' : '✘ ') + esc_(c[1]) + '</p>';
    }).join(''));
    return page_('Voc-Lang Apps Script', '<h1>Voc-Lang Apps Script đang chạy</h1><p>Mở từ nút <b>Gửi tài liệu</b> trên <a href="' + ADMIN_URL + '">trang quản trị</a>, ' +
      'hoặc <a href="?action=test">kiểm tra cấu hình</a>.</p>');
  } catch (err) {
    return page_('Lỗi', '<h1>Lỗi</h1><p class="err">' + esc_(err.message || err) + '</p>');
  }
}

function sendPage_(id) {
  var o = getOrder_(id);
  if (!o) return page_('Không tìm thấy đơn', '<h1>Không tìm thấy đơn</h1><p class="err">Mã đơn ' + esc_(id) + ' không có trên Firestore.</p>');
  var warn = {
    pending: 'Người mua <b>chưa bấm "Đã chuyển khoản"</b>. Chỉ gửi khi bạn đã thấy tiền trong tài khoản.',
    unpaid: 'Đơn đang ở trạng thái <b>Chưa thấy tiền</b>. Chỉ gửi khi bạn đã thấy tiền.',
    sent: 'Đơn <b>đã gửi</b> lúc ' + fmt_(o.sentAt) + '. Gửi lại sẽ tạo link mới 24 giờ.',
    cancelled: 'Đơn <b>đã hủy</b>, không gửi được.'
  }[o.status] || '';
  var body = '<h1>Gửi tài liệu</h1>' +
    '<div class="card"><b>' + esc_(o.productName) + '</b> · ' + vnd_(o.price) + '<br>' +
    'Người mua: <b>' + esc_(o.email) + '</b>' + (o.name ? ' (' + esc_(o.name) + ')' : '') + '<br>' +
    'Mã đơn: <b>' + esc_(o.code) + '</b> · nội dung CK: ' + esc_(o.transfer) + '<br>' +
    '<span class="muted">Tạo ' + fmt_(o.createdAt) + (o.reportedAt ? ' · báo chuyển khoản ' + fmt_(o.reportedAt) : '') + '</span></div>' +
    (warn ? '<p class="warn">' + warn + '</p>' : '') +
    '<div id="step1">' + (o.status === 'cancelled' ? '' :
      '<p>Bấm nút dưới để tạo link tải 24 giờ và soạn sẵn thư trong Gmail. Đơn sẽ được ghi là <b>Đã gửi tài liệu</b>.</p>' +
      '<button id="mk" onclick="mk()">Tạo thư gửi tài liệu</button>') + '</div>' +
    '<div id="step2" style="display:none"></div>' +
    '<script>var id=' + JSON.stringify(o.id) + ', draft=null;' +
    'function show(h){document.getElementById("step2").style.display="block";document.getElementById("step2").innerHTML=h;}' +
    'function fail(e){show("<p class=err>Lỗi: "+String(e&&e.message||e).replace(/</g,"&lt;")+"</p>");var b=document.getElementById("mk");if(b)b.disabled=false;}' +
    'function mk(){var b=document.getElementById("mk");b.disabled=true;b.textContent="Đang tạo…";' +
    'google.script.run.withSuccessHandler(function(r){draft=r;document.getElementById("step1").style.display="none";' +
    'show("<p class=ok>Đã soạn thư tới <b>"+r.email+"</b> (link dùng đến "+r.expires+") và ghi đơn là Đã gửi tài liệu.</p>"+' +
    '"<button id=sd onclick=sd()>Gửi luôn</button><a class=\\"btn soft\\" href=\\""+r.draftUrl+"\\" target=_blank>Mở thư nháp để sửa</a>"+' +
    '"<p class=muted>Mở thư nháp: đọc lại rồi bấm Gửi trong Gmail.</p>");}).withFailureHandler(fail).createDraft(id);}' +
    'function sd(){var b=document.getElementById("sd");b.disabled=true;b.textContent="Đang gửi…";' +
    'google.script.run.withSuccessHandler(function(){show("<p class=ok>✔ Đã gửi tài liệu tới <b>"+draft.email+"</b>. Bạn có thể đóng tab này.</p>");})' +
    '.withFailureHandler(fail).sendDraft(draft.draftId);}</script>';
  return page_('Gửi tài liệu ' + o.code, body);
}

/* ============================================================
 * 3. Kiểm tra cấu hình + cài trigger
 * ============================================================ */
function checks_() {
  var out = [];
  try {
    var n = fs_(':runQuery', { method: 'post', payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'orders' }], limit: 50 } }) })
      .filter(function (r) { return r.document; }).length;
    out.push([true, 'Đọc được Firestore (' + n + ' đơn trong 50 đơn đầu).']);
  } catch (e) { out.push([false, 'Không đọc được Firestore: ' + e.message]); }
  Object.keys(FILES).forEach(function (pid) {
    try {
      var res = UrlFetchApp.fetch(presign_(FILES[pid].key, 0.1), { headers: { Range: 'bytes=0-1' }, muteHttpExceptions: true });
      var c = res.getResponseCode();
      out.push([c === 206 || c === 200, 'Link tải ' + FILES[pid].key + ': HTTP ' + c]);
    } catch (e) { out.push([false, 'Link tải ' + FILES[pid].key + ': ' + e.message]); }
  });
  var t = ScriptApp.getProjectTriggers().filter(function (x) { return x.getHandlerFunction() === 'notifyNewOrders'; }).length;
  out.push([t === 1, t === 1 ? 'Trigger báo đơn mới: đã bật (5 phút / lần).' : 'Trigger báo đơn mới: chưa bật — chạy hàm setup() trong trình soạn thảo.']);
  out.push([true, 'Email nhận báo đơn: ' + ownerEmail_()]);
  var s = senderEmail_();
  if (!s) out.push([true, 'Thư gửi người mua đi từ: ' + Session.getEffectiveUser().getEmail() + ' (chưa đặt SENDER_EMAIL).']);
  else {
    var ready = false;
    try { ready = senderReady_(s); } catch (e) { /* để ready = false */ }
    out.push([ready, ready ? 'Thư gửi người mua đi từ: ' + s + ' (người mua trả lời cũng về địa chỉ này).'
      : 'SENDER_EMAIL = ' + s + ' nhưng Gmail chưa có địa chỉ gửi này. Thêm trong Gmail → Cài đặt → Tài khoản và Nhập → Gửi thư bằng địa chỉ.']);
  }
  return out;
}

/** Chạy 1 lần trong trình soạn thảo (chọn hàm setup → Run): cấp quyền, tạo trigger 5 phút, in kết quả kiểm tra */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifyNewOrders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('notifyNewOrders').timeBased().everyMinutes(5).create();
  checks_().forEach(function (c) { Logger.log((c[0] ? 'OK   ' : 'LỖI  ') + c[1]); });
}
