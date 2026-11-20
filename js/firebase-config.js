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
