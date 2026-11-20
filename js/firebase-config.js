/*
 * Cấu hình Firebase cho đăng nhập Google + đồng bộ tiến độ (xem HUONG-DAN-DANG-NHAP.md).
 * Dán các giá trị từ Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.
 *
 * Đây KHÔNG phải mật khẩu: mọi trang web dùng Firebase đều công khai các giá trị này.
 * Dữ liệu được bảo vệ bởi Firestore Rules (firestore.rules) — mỗi người chỉ đọc/ghi được dữ liệu của chính mình.
 * Dự án Firebase: voc-lang-hsk (gói Spark miễn phí).
 */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDVKR7kvxWZpk50_59b6DgIlKdTKh5F6rw',
  authDomain: 'voc-lang-hsk.firebaseapp.com',
  projectId: 'voc-lang-hsk',
  appId: '1:1078307973316:web:d8a142ac99d69c3a56c191'
};

/*
 * ADMIN_EMAIL — trang báo cáo quản trị (admin-report/) chỉ mở cho email này.
 * Lưu dạng mã băm SHA-256 (chữ thường) thay vì email thật để không công khai email trên GitHub.
 * Đổi admin: chạy  node -e "console.log(require('crypto').createHash('sha256').update('email@gmail.com').digest('hex'))"
 * rồi dán kết quả vào đây, và sửa email trong Firestore Rules (firestore.rules). Rules mới là lớp bảo vệ dữ liệu thật sự.
 */
window.ADMIN_EMAIL_SHA256 = '432ae40de438891d9a08be9fe7660d8d628210b13f5cd556401f67a3339223fd';
