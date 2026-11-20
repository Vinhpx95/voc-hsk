/*
 * Cấu hình Firebase cho đăng nhập Google + đồng bộ tiến độ (xem HUONG-DAN-DANG-NHAP.md).
 * Dán các giá trị từ Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.
 *
 * Đây KHÔNG phải mật khẩu: mọi trang web dùng Firebase đều công khai các giá trị này.
 * Dữ liệu được bảo vệ bởi Firestore Rules (firestore.rules) — mỗi người chỉ đọc/ghi được dữ liệu của chính mình.
 * Để trống apiKey thì trang chạy ở chế độ không đăng nhập (tiến độ chỉ lưu trên trình duyệt).
 */
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: ''
};
