# Bật đăng nhập Google cho Voc-Lang (Firebase)

Voc-Lang dùng **Firebase** (gói miễn phí Spark) để đăng nhập Google và lưu tiến độ học lên mây.
Mất khoảng 10 phút, làm một lần. **Bắt buộc đăng nhập** mới vào học được. Chừng nào `js/firebase-config.js` còn
để trống, ai mở trang cũng chỉ thấy màn hình chào và nút Google báo "đang được thiết lập", nên **đừng push lên
GitHub trước khi điền cấu hình**. Thêm `?welcome` vào địa chỉ để xem thử luồng đăng nhập bằng tài khoản mẫu
(avatar, menu, đăng xuất).

## 1. Tạo dự án

1. Vào <https://console.firebase.google.com> bằng tài khoản Google của bạn → **Create a project**.
2. Đặt tên (ví dụ `voc-lang`), có thể tắt Google Analytics → **Create project**.

## 2. Bật đăng nhập Google

1. Menu trái **Build → Authentication → Get started**.
2. Tab **Sign-in method → Google → Enable**, chọn *Project support email* → **Save**.
3. Tab **Settings → Authorized domains → Add domain**: thêm `voclanghsk.com` (tên miền chính, gắn vào GitHub Pages) và `voc-hsk.netlify.app`, `vinhpx95.github.io` (địa chỉ cũ, tự chuyển hướng sang voclanghsk.com)
   (`localhost` đã có sẵn để thử trên máy).

## 3. Tạo Firestore và dán quy tắc bảo mật

1. **Build → Firestore Database → Create database**.
2. Chọn vị trí gần Việt Nam, ví dụ `asia-southeast1 (Singapore)` (không đổi được về sau) → **Production mode**.
3. Tab **Rules**: xóa nội dung cũ, dán toàn bộ file [`firestore.rules`](firestore.rules) → **Publish**.
   Quy tắc này đảm bảo mỗi người chỉ đọc và ghi được dữ liệu của chính mình.
4. **Tắt lập chỉ mục cho tiến độ từng từ** (giảm dung lượng 2–3 lần, để gói miễn phí chứa được nhiều tài khoản hơn):
   tab **Indexes** → chọn mục **Automatic** ở góc phải (tên cũ: *Single field*) → **Add exemption**:
   - *Collection ID*: `progress`
   - *Field path*: `words`
   - *Query scope*: tick cả **Collection** và **Collection group**
   - Chuyển cả 3 kiểu chỉ mục (*Ascending*, *Descending*, *Arrays*) sang **Disabled** → **Save**.

   App chỉ đọc nguyên tài liệu, không bao giờ tìm kiếm theo trường này, nên tắt không ảnh hưởng gì.
   (Nếu dùng Firebase CLI: file [`firestore.indexes.json`](firestore.indexes.json) đã khai báo sẵn mục này.)

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

- Thử trên máy: mở trang qua `http://localhost:...`. Đăng nhập **không** chạy khi mở file `index.html` trực tiếp,
  nên từ giờ muốn học trên máy thì mở qua localhost hoặc GitHub Pages.
- Push lên `main` → GitHub Pages cập nhật sau 1–2 phút → mở <https://voclanghsk.com/>.

## Cách đồng bộ hoạt động

- Mọi thứ tự động, không có nút đồng bộ. Trang luôn lưu trên máy trước, nên vẫn học được khi mất mạng; gặp lỗi thì
  tự thử lại sau 30 giây. Thay đổi được gom và gửi lên 10 giây một lần, hoặc ngay khi rời trang / chuyển sang app khác.
  Khi mở trang hoặc quay lại tab, trang tải bản mới từ thiết bị khác về.
- Nếu học trên hai máy cùng lúc, từng từ giữ lần chấm điểm mới nhất. Thống kê tập viết được gộp theo từng chữ.
  Số từ học hôm nay được cộng gộp, các cấp đã mở không bị khóa lại.
- Tiến độ đã học trên trình duyệt từ trước khi có đăng nhập được đưa vào tài khoản ở lần đăng nhập đầu tiên.
- **Đăng xuất**: trước khi đăng xuất, tiến độ được gửi lên tài khoản rồi mới xóa khỏi máy, nên máy dùng chung không
  lộ dữ liệu.
- **Đặt lại tiến độ** khi đã đăng nhập sẽ xóa trên mọi thiết bị.
- Dữ liệu trong Firestore:
  - `users/{uid}`: tên, email, mục tiêu ngày, chuỗi ngày học, lộ trình.
  - `users/{uid}/progress/{cấp HSK}`: tiến độ từng từ.

## Trang báo cáo quản trị (admin)

Địa chỉ: <https://voclanghsk.com/admin-report/>. Trang không có liên kết ở đâu, không được Google lập chỉ mục,
và chỉ mở cho email quản trị. Người chưa đăng nhập hoặc tài khoản khác bị chuyển về trang chủ.

- **Thẻ tổng quan:** tổng tài khoản, tổng lượt sử dụng, người dùng mới 7 ngày qua, người hoạt động hôm nay.
- **Bảng từng tài khoản** (mới hoạt động lên đầu, có ô tìm kiếm): email, tên, ngày tham gia, lần hoạt động gần nhất,
  số lần sử dụng, số từ đã học (đã thuộc).
- **Export to CSV:** tải bảng về máy, mã UTF-8 có BOM nên Excel hiển thị đúng tiếng Việt.

Cách tính:
- *Ngày tham gia* = ngày tạo tài khoản trên Firebase (lần đăng nhập Google đầu tiên).
- *Một lượt sử dụng* = đăng nhập, mở trang hoặc quay lại tab sau **≥ 30 phút** không hoạt động trên thiết bị đó.
  Tải lại trang (F5) hay học liên tục không cộng thêm. Mỗi thiết bị tính riêng.
- *Từ đã học* = từ đang học + đã thuộc; *đã thuộc* = trạng thái "Đã thuộc".
- Số liệu ghi vào `users/{uid}` (`firstLoginAt`, `lastActiveAt`, `sessionCount`, `learnedWordsCount`,
  `masteredWordsCount`) cùng lần đồng bộ tiến độ, nên hầu như không tốn thêm lượt ghi. Tài khoản đăng nhập trước khi có
  tính năng này sẽ có số liệu từ lần mở trang tiếp theo.

Cấu hình quản trị viên:
1. `js/firebase-config.js` → `ADMIN_EMAIL_SHA256`: mã băm SHA-256 của email admin (viết thường). Dùng mã băm để email
   không bị công khai trên GitHub. Lệnh tạo mã có ghi trong file.
2. **Firestore Rules** (bắt buộc, đây mới là lớp bảo vệ thật): dán [`firestore.rules`](firestore.rules) vào Console,
   thay `EMAIL_QUAN_TRI@gmail.com` bằng email admin → **Publish**. Admin chỉ được *đọc* hồ sơ tổng của mọi người,
   không đọc được tiến độ chi tiết và không ghi được dữ liệu của ai.

## Lỗi thường gặp

| Thông báo trên trang | Cách xử lý |
|---|---|
| Tên miền này chưa được phép đăng nhập | Thêm tên miền ở bước 2.3 |
| Đăng nhập bằng Google chưa được bật | Bật Google ở bước 2.2 |
| Trình duyệt đã chặn cửa sổ đăng nhập | Cho phép cửa sổ bật lên (popup) cho trang |
| Bạn đang mở trang trong một ứng dụng | Google chặn đăng nhập trong Zalo/Facebook. Mở bằng Chrome hoặc Safari |
| Trang báo cáo: "Firestore chưa cho phép tài khoản quản trị đọc dữ liệu" | Dán Rules mới (có email admin) rồi Publish |

## Gói miễn phí (Spark) đủ cho bao nhiêu người

| Hạn mức Firestore | Mức dùng của Voc-Lang | Ước tính |
|---|---|---|
| 1 GiB dữ liệu | ~0,25 KB mỗi từ đã học (sau bước 3.4) | ~8.000 tài khoản học 500 từ |
| 20.000 lượt ghi / ngày | ~20–30 lượt cho một buổi học 50 từ | ~700–1.000 buổi học mỗi ngày |
| 50.000 lượt đọc / ngày | ~2–12 lượt mỗi lần mở trang | ~2.000 buổi học mỗi ngày |

Vượt hạn mức thì Firestore tạm ngừng đến khi hạn mức được làm mới. Người học vẫn học bình thường (lưu trên máy) và tiến
độ tự gửi bù sau. Đông hơn mức này thì chuyển sang gói Blaze (trả theo dùng, khoảng 0,18 USD cho mỗi 100.000 lượt ghi).
