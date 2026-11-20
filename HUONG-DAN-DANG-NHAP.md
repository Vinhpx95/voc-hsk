# Bật đăng nhập Google cho Voc-Lang (Firebase)

Voc-Lang dùng **Firebase** (gói miễn phí Spark) để đăng nhập Google và lưu tiến độ học lên mây.
Mất khoảng 10 phút, làm một lần. Chừng nào `js/firebase-config.js` còn để trống, trang vẫn chạy như cũ:
không có màn hình chào, tiến độ chỉ lưu trên trình duyệt.

## 1. Tạo dự án

1. Vào <https://console.firebase.google.com> bằng tài khoản Google của bạn → **Create a project**.
2. Đặt tên (ví dụ `voc-lang`), có thể tắt Google Analytics → **Create project**.

## 2. Bật đăng nhập Google

1. Menu trái **Build → Authentication → Get started**.
2. Tab **Sign-in method → Google → Enable**, chọn *Project support email* → **Save**.
3. Tab **Settings → Authorized domains → Add domain**: thêm `vinhpx95.github.io`
   (`localhost` đã có sẵn để thử trên máy).

## 3. Tạo Firestore và dán quy tắc bảo mật

1. **Build → Firestore Database → Create database**.
2. Chọn vị trí gần Việt Nam, ví dụ `asia-southeast1 (Singapore)` (không đổi được về sau) → **Production mode**.
3. Tab **Rules**: xóa nội dung cũ, dán toàn bộ file [`firestore.rules`](firestore.rules) → **Publish**.
   Quy tắc này đảm bảo mỗi người chỉ đọc và ghi được dữ liệu của chính mình.

## 4. Lấy cấu hình web và dán vào dự án

1. Bánh răng ⚙ cạnh *Project Overview* → **Project settings** → mục *Your apps* → biểu tượng **`</>`** (Web).
2. Đặt tên app (ví dụ `voc-lang-web`), **không** cần tick Firebase Hosting → **Register app**.
3. Firebase hiện đoạn `const firebaseConfig = { ... }`. Chép 4 giá trị sau vào `js/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'voc-lang.firebaseapp.com',
  projectId: 'voc-lang',
  appId: '1:1234567890:web:abc123'
};
```

Các giá trị này **không phải mật khẩu**: mọi trang web dùng Firebase đều công khai chúng, nên commit lên GitHub
không sao. Dữ liệu được bảo vệ bằng quy tắc ở bước 3.

## 5. Thử và đưa lên mạng

- Thử trên máy: mở trang qua `http://localhost:...` (đăng nhập **không** chạy khi mở file `index.html` trực tiếp;
  khi đó trang vẫn cho học như cũ).
- Push lên `main` → GitHub Pages cập nhật sau 1–2 phút → mở <https://vinhpx95.github.io/voc-hsk/>.

## Cách đồng bộ hoạt động

- Mọi thứ tự động, không có nút đồng bộ. Trang luôn lưu trên máy trước, nên vẫn học được khi mất mạng; gặp lỗi thì tự thử lại sau 30 giây. Sau mỗi thay đổi khoảng 2 giây, hoặc khi chuyển
  sang app khác, tiến độ được gửi lên. Khi mở trang hoặc quay lại tab, trang tải bản mới từ thiết bị khác về.
- Nếu học trên hai máy cùng lúc, từng từ giữ lần chấm điểm mới nhất. Thống kê tập viết được gộp theo từng chữ.
  Số từ học hôm nay được cộng gộp, các cấp đã mở không bị khóa lại.
- Người **học thử** (không đăng nhập) mà sau đó đăng nhập: tiến độ đã học được đưa vào tài khoản.
- **Đăng xuất**: trước khi đăng xuất, tiến độ được gửi lên tài khoản rồi mới xóa khỏi máy, nên máy dùng chung không
  lộ dữ liệu.
- **Đặt lại tiến độ** khi đã đăng nhập sẽ xóa trên mọi thiết bị.
- Dữ liệu trong Firestore:
  - `users/{uid}`: tên, email, mục tiêu ngày, chuỗi ngày học, lộ trình.
  - `users/{uid}/progress/{cấp HSK}`: tiến độ từng từ.

## Lỗi thường gặp

| Thông báo trên trang | Cách xử lý |
|---|---|
| Tên miền này chưa được phép đăng nhập | Thêm tên miền ở bước 2.3 |
| Đăng nhập bằng Google chưa được bật | Bật Google ở bước 2.2 |
| Trình duyệt đã chặn cửa sổ đăng nhập | Cho phép cửa sổ bật lên (popup) cho trang |
| Bạn đang mở trang trong một ứng dụng | Google chặn đăng nhập trong Zalo/Facebook. Mở bằng Chrome hoặc Safari |

Gói miễn phí cho phép 50.000 lượt đọc và 20.000 lượt ghi Firestore mỗi ngày. Mỗi lần mở trang tốn khoảng 12 lượt
đọc, và các lần ghi được gom lại, nên đủ cho hàng trăm người học mỗi ngày.
