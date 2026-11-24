# Apps Script gửi tài liệu — hướng dẫn cài đặt

Script chạy bằng tài khoản Google của bạn và làm hai việc:

- **Cứ 5 phút một lần:** đơn nào vừa bấm "Đã chuyển khoản" thì gửi một email báo bạn, kèm nút mở trang quản trị.
- **Khi bạn bấm "Gửi tài liệu" ở trang quản trị:** mở trang xác nhận. Bấm "Tạo thư gửi tài liệu" thì script tạo link
  tải R2 dùng được 24 giờ, soạn sẵn thư trong Gmail tới người mua và ghi đơn là "Đã gửi tài liệu". Sau đó bạn bấm
  **Gửi luôn**, hoặc mở thư nháp để sửa rồi tự gửi.

Mã nguồn: [Code.gs](Code.gs) và [appsscript.json](appsscript.json). Khóa R2 không nằm trong mã nguồn mà nằm trong
Script Properties, chỉ bạn xem được.

> Dùng **tài khoản admin của trang quản trị** (hiện là Gmail riêng của Voc-Lang). Tài khoản này phải là thành viên
> dự án Firebase `voc-lang-hsk` với vai trò **Owner** hoặc **Editor** (Firebase Console → bánh răng → *Users and
> permissions*). Script đọc và ghi đơn hàng bằng quyền của tài khoản này, và thư gửi người mua đi từ Gmail của nó.

## 1. Tạo khóa R2 chỉ được đọc

1. Vào Cloudflare → **R2 Object Storage** → **Manage API tokens** → **Create Account API token**.
   (Giữ nguyên token `voc-lang-hsk-document-link` đang có: đó là khóa đọc + ghi mà `tools/tai-lieu/r2.js` dùng để tải file lên.)
2. **Token name:** ví dụ `voc-lang-apps-script-doc`.
3. **Permissions:** chọn **Object Read only**.
4. **Specify bucket(s):** chọn *Apply to specific buckets only* → `voc-lang-hsk-tai-lieu`.
5. **TTL:** *Forever*. **Client IP Address Filtering:** để trống (Apps Script chạy từ nhiều IP của Google).
   Bấm **Create Account API token**.
6. Màn hình kết quả hiện **Access Key ID** và **Secret Access Key** (dùng hai giá trị này, không dùng ô *Token value*).
   Để nguyên tab này để chép ở bước 3 (Secret chỉ hiện một lần). **Đừng gửi hai giá trị này cho ai, kể cả Claude.**

Khóa này chỉ tải file về được, không ghi hay xóa được gì trong bucket.

## 2. Tạo project Apps Script

1. Mở <https://script.google.com> bằng tài khoản ở trên → **New project**.
2. Đổi tên project (góc trên bên trái), ví dụ `Voc-Lang gửi tài liệu`.
3. **Project Settings** (bánh răng bên trái) → bật **Show "appsscript.json" manifest file in editor**.
4. Quay lại **Editor** (biểu tượng `< >`):
   - Mở `appsscript.json`, xóa hết, dán toàn bộ nội dung file [appsscript.json](appsscript.json).
   - Mở `Code.gs`, xóa hết, dán toàn bộ nội dung file [Code.gs](Code.gs).
   - Bấm **Save** (biểu tượng đĩa mềm).

## 3. Điền khóa vào Script Properties

**Project Settings** → kéo xuống **Script Properties** → **Add script property**, thêm 4 dòng:

| Property | Giá trị |
|---|---|
| `R2_ACCOUNT_ID` | Account ID của Cloudflare (giống dòng `R2_ACCOUNT_ID` trong `D:\private\voc-lang-tai-lieu\.r2.env`) |
| `R2_ACCESS_KEY_ID` | Access Key ID của khóa chỉ-đọc vừa tạo |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key của khóa chỉ-đọc vừa tạo |
| `R2_BUCKET` | `voc-lang-hsk-tai-lieu` |

Tùy chọn:

- `OWNER_EMAIL`: nhận email báo đơn mới ở địa chỉ khác (mặc định là tài khoản chạy script).
- `SENDER_EMAIL`: thư gửi người mua đi từ địa chỉ này thay cho Gmail cá nhân, người mua trả lời cũng về đây
  (xem mục *Gửi thư bằng Gmail riêng của Voc-Lang* bên dưới).

Bấm **Save script properties**.

## 4. Cấp quyền và bật báo đơn mới

1. Về **Editor**, ở thanh trên chọn hàm **`setup`** → bấm **Run**.
2. Google hỏi quyền → **Review permissions** → chọn tài khoản → màn hình *"Google hasn't verified this app"* →
   **Advanced** → **Go to Voc-Lang gửi tài liệu (unsafe)** → **Allow**.
   (Đây là script của chính bạn nên Google chưa "xác minh"; quyền gồm: đọc/ghi Firestore, gửi và soạn thư Gmail,
   gọi link R2, tạo trigger.)
3. Xem **Execution log** bên dưới. Mọi dòng phải bắt đầu bằng `OK`:
   - `Đọc được Firestore (...)`
   - `Link tải Goi-1-…zip: HTTP 206` (cả 3 gói)
   - `Trigger báo đơn mới: đã bật`

   Dòng nào `LỖI` thì chép nguyên dòng gửi Claude (không kèm khóa).

## 5. Triển khai Web app

1. **Deploy** (góc trên bên phải) → **New deployment** → bánh răng cạnh *Select type* → **Web app**.
2. **Description:** `v1`. **Execute as:** *Me*. **Who has access:** **Only myself**.
3. **Deploy** → chép **Web app URL** (dạng `https://script.google.com/macros/s/…/exec`).
4. Mở URL đó và thêm `?action=test` ở cuối để kiểm tra lại: mọi dòng có dấu ✔.

## 6. Nối với trang quản trị

Sau khi trang mới đã lên GitHub (bước 6.6): mở trang quản trị → mục **Đơn hàng tài liệu** → **Dán URL Apps Script**
→ dán Web app URL. URL lưu trên trình duyệt đó; dùng máy khác thì dán lại một lần.

## Gửi thư bằng Gmail riêng của Voc-Lang

Để người mua thấy thư từ `Voc-Lang-HSK <voclang.hsk@gmail.com>` thay cho Gmail cá nhân. Script vẫn chạy bằng tài khoản cũ
(tài khoản admin), chỉ đổi địa chỉ gửi. Không cần mục này nếu script đã chạy bằng chính Gmail của Voc-Lang.

1. Trong **Gmail của tài khoản chạy script** → bánh răng → **Xem tất cả chế độ cài đặt** → **Tài khoản và Nhập** →
   **Gửi thư bằng địa chỉ** → **Thêm địa chỉ email khác**. Tên `Voc-Lang-HSK`, địa chỉ Gmail mới, **bỏ tích "Coi như bí danh"**.
   Mở hộp thư Gmail mới để bấm link / lấy mã xác minh.
2. (Nên làm) Trong **Gmail mới** → **Chuyển tiếp và POP/IMAP** → chuyển tiếp về Gmail cá nhân, để thấy ngay khi người
   mua trả lời.
3. Apps Script → **Project Settings** → **Script Properties** → thêm `SENDER_EMAIL` = địa chỉ Gmail mới → Save.
4. Chạy lại hàm **`setup`**: phải có dòng `OK   Thư gửi người mua đi từ: <Gmail mới> …`.
   Nếu là `LỖI` thì bước 1 chưa xác minh xong.

Xóa `SENDER_EMAIL` thì thư lại đi từ Gmail cá nhân.

## Khi sửa Code.gs sau này

Dán mã mới → Save → **Deploy** → **Manage deployments** → bút chì → *Version: New version* → **Deploy**.
URL Web app giữ nguyên.
