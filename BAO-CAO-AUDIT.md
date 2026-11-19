# Báo cáo rà soát dữ liệu từ vựng (Audit)

Phạm vi: toàn bộ 12.207 từ (HSK 1 → HSK 7-9 phần 5) trong `data/*.csv` → `js/data/*.js`, gồm chữ Hán, phồn thể, pinyin, nghĩa tiếng Việt, từ loại, 3 câu ví dụ (chữ Hán – pinyin – tiếng Việt) và pinyin từ liên quan.

Cách làm:
1. **Kiểm tra tự động** đối chiếu với từ điển CC-CEDICT (~125.000 mục) và bộ chuyển giản/phồn thể OpenCC.
2. **Rà soát ngôn ngữ** từng từ (41 lô × ~300 từ) theo 6 tiêu chuẩn: chữ Hán, pinyin, nghĩa, từ loại, câu ví dụ, cấu trúc dữ liệu. Chỉ sửa chỗ sai thật.
3. **Chuẩn hóa pinyin tự động** theo quy tắc chính tả pinyin GB/T 16159.

Bản sao dữ liệu trước mỗi bước nằm trong thư mục scratchpad của phiên làm việc (`data.before-audit`, `data.before-review`, `data.before-pyformat`).

---

## 1. Tổng quan số lỗi đã sửa

| Nhóm lỗi | Số bản sửa |
|---|---|
| Từ loại thiếu / sai / không đứng đầu `tags` | 3.073 |
| Nghĩa tiếng Việt sai, dịch máy, gộp nhiều nghĩa không tách | 785 (+ ~40 từ bước kiểm tra trước) |
| Chữ phồn thể sai / chuyển nửa vời (cột `traditional`) | 363 sửa + 228 bổ sung còn thiếu + 7 dị thể |
| Pinyin câu ví dụ sai âm / sai thanh | 252 + 100 (tự động) |
| Pinyin của từ sai | 48 + 20 (tự động) |
| Câu ví dụ viết lại (sai ngữ pháp, không tự nhiên, không chứa từ, quá khó, sai logic) | ~175 câu |
| Bản dịch câu sai / không khớp chữ Hán | 78 |
| Định dạng pinyin (viết liền từ, viết hoa, dấu `'`, biến điệu 一/不) | ~47.800 chuỗi pinyin |

Tổng: ~5.200 bản sửa nội dung trên 4.180 từ, cộng chuẩn hóa định dạng pinyin toàn bộ dữ liệu.

---

## 2. Lỗi nghiêm trọng tiêu biểu

### 2.1 Chữ Hán
- Câu ví dụ dùng **sai chữ / sai từ**: 让**坐** → 让座; 师父 dùng để gọi tài xế (đúng: 师傅); 登陆 dùng cho "đăng nhập" (đúng: 登录); 直视自己的缺点 (đúng: 正视); 闷 dùng cho "om cơm" (đúng: 焖); 刷牙齿 (đúng: 刷牙); 说得都是事实 (đúng: 说的, nhầm 的/得).
- Cột phồn thể bị chuyển máy sai nghĩa: 面→**麵** (mì) trong 局面, 封面, 改头换面…; 家→**傢** trong 画家, 家长, 企业家…; 制→**製** trong 机制, 体制; 系→**繫**; 台→**颱** (bão) trong 祝英台; 松→**鬆** trong 马拉松; 里→**裡** trong 里程碑; 干→**乾/幹** trong 干扰; nhiều từ chỉ chuyển được một nửa (簡**体**字, 獨樹一**帜**…).
- Không còn chữ phồn thể lẫn trong cột chữ Hán giản thể (trừ tên riêng 毕昇, giữ nguyên theo chuẩn).

### 2.2 Pinyin
- Đa âm tự đọc sai: 行 **háng**→xíng (行程, 试行, 践行…), 为 **wèi**→wéi (以人为本, 为首…), 教 **jiāo**→jiào (宗教, 教科书…), 调 **tiáo**→diào (调研, 问卷调查…), 乐 **lè**→yuè (摇滚乐, 交响乐…), 长 **cháng**→zhǎng (家长, 参谋长…), 着 **zhe**→zhuó (着陆, 着眼), 载 **zǎi**→zài (满载, 负载…), 称 **chēng**→chèn (称职, 对称), 差 chà→chā (差异, 反差), 磨 (xay) mó→mò, 倔 jué→juè, 拧 (vặn) níng→nǐng, 抽丝剥茧 bāo→bō…
- Pinyin câu không khớp chữ Hán: 只有 ghi "zhǐ **yào**" (13 câu), 今年 ghi "jīn **tiān**", 很高 ghi "hěn **hǎo**", câu 断裂 lệch toàn bộ âm tiết, thiếu âm tiết 之 trong "之一"…
- Thiếu dấu thanh hàng loạt ở HSK 7-9 (xi, liang, shi, fu, dao…).
- Câu 七: "星期七" là tiếng Trung sai (không có "thứ bảy" kiểu này) — đã viết lại câu.

### 2.3 Nghĩa tiếng Việt
- Dịch sai nghĩa: 安宁 "an ninh" (đúng: yên bình), 灵感 "linh cảm" (đúng: cảm hứng), 客房 "phòng khách" (đúng: phòng nghỉ), 女士 "nữ sĩ" (đúng: quý bà/quý cô), 商标 "thương hiệu" (đúng: nhãn hiệu), 实行 "thực hành" (đúng: thực hiện), 停工 "đình công" (đúng: ngừng việc), 潜水 "tàu ngầm" (đúng: lặn).
- Ghép nhầm thành ngữ Việt: 口是心非 "khẩu phật tâm xà" (là 口蜜腹剑), 落井下石 "thừa nước đục thả câu", 好高骛远 "đứng núi này trông núi nọ", 功亏一篑 "công dã tràng", 南辕北辙 "trống đánh xuôi kèn thổi ngược", 安土重迁 "an cư lạc nghiệp".
- Từ nhiều nghĩa nay tách bằng `;`: ví dụ 是 "là; đúng, vâng", 行 "đi; được, ổn; giỏi, cừ", 花 "hoa; tiêu (tiền), tốn (thời gian)" — 959 từ.

### 2.4 Từ loại
- Hơn 3.000 từ có `tags` không có từ loại hoặc từ loại đứng sau chủ đề → nay **mọi từ** đều có từ loại ở vị trí đầu.
- Sửa từ loại sai: 刚才/以前/以后 (phó từ → danh từ), 生气 (tính từ → động từ), 休克 (danh từ → động từ), 连同 (→ liên từ)…

### 2.5 Câu ví dụ
- Câu **không chứa từ cần học**: 马上, 合适 (dùng 适合), 语言 (dùng 外语), 邮局 (dùng 邮政局), 想 (dùng 想念), 一点儿 (dùng 有点儿)…
- Câu sai ngữ pháp / phi logic: 虽然…但是反而, 因为…因此, 越来越减少了, 大声抽烟, 中国在北京的南边吗, 万人空巷 dùng ngược nghĩa…
- Câu quá khó so với cấp: câu của từ HSK 1–2 dùng 翻天覆地, 远亲不如近邻, 热气腾腾… → viết lại bằng từ vựng HSK 1–3.
- Dịch câu không khớp: 保护水土 → "bảo vệ đất nước" (đúng: giữ đất giữ nước), 营地 → "doanh trại"…

### 2.6 Cấu trúc dữ liệu
- Không còn từ trùng lặp (đã xóa 1.581 dòng trùng ở part2/part3 trước đó và 2 dòng viết sai chính tả 吊以轻心, 记录片).
- Không còn trường rỗng, khoảng trắng thừa, ký tự ẩn, công thức LaTeX ($O_2$), dấu ngoặc cong trong pinyin.
- Tất cả slug chủ đề đều có nhãn tiếng Việt trong app.

---

## 3. Chuẩn hóa pinyin (GB/T 16159)

| Quy tắc | Trước | Sau |
|---|---|---|
| Viết liền theo từ | `xué xí` | `xuéxí` |
| Viết hoa tên riêng, địa danh | `zhōng guó`, `běi jīng`, `hàn yǔ` | `Zhōngguó`, `Běijīng`, `Hànyǔ` |
| Viết hoa họ người | `wáng lǎo shī` | `Wáng lǎoshī`, `Xiǎo Wáng` |
| Viết hoa đầu câu | `wǒ shì…` | `Wǒ shì…` |
| Dấu cách âm `'` | `nǚ ér` | `nǚ'ér` |
| Thành ngữ 4 chữ | `kè zhōu qiú jiàn` | `kèzhōu-qiújiàn` |
| 了/着/过 gắn động từ | `chī le fàn` | `chīle fàn` |
| 们 gắn từ trước | `tóng xué men` | `tóngxuémen` |
| Biến điệu 一/不 thống nhất | lẫn lộn `yī gè`/`yí gè` | `yí gè`, `yìqǐ`, `bú shì`, `kànyikàn`; giữ `yī` khi là số/thứ tự (第一, 一月, 统一) |
| Thanh nhẹ | — | giữ không dấu: de, le, ma, ne, men, zi… |
| Vị trí dấu thanh, chữ ü | đã kiểm tra tự động: 0 lỗi (duì, liù, nǚ, lǜ, jū, xué) |

Đã xác minh bằng script: chuẩn hóa chỉ đổi dấu cách/viết hoa/dấu `'`/biến điệu — **không làm thay đổi âm tiết** nào.

Ô tìm kiếm tab Từ vựng đã được sửa để tìm pinyin không cần dấu và không cần dấu cách (gõ `xuexi` ra 学习).

---

## 4. Ghi chú & giới hạn

- **Trường mã thanh điệu (1–5)**: dữ liệu không có trường này và app không tô màu thanh điệu, nên không áp dụng.
- **Tách từ pinyin trong câu** dùng từ điển CC-CEDICT + từ vựng của app; một số cụm còn có thể viết liền/tách khác cách giáo trình chọn (ví dụ `zhǎngde`, `xiǎngbànfǎ`) — không ảnh hưởng âm đọc.
- 5 câu dùng động từ ly hợp tách tự nhiên (洗个澡, 帮个忙, 打八折, 抽…烟) được giữ nguyên vì đúng ngữ pháp.
- Một số tên riêng một chữ trong câu (ngoài họ + chức danh) có thể chưa viết hoa.
- Rà soát ngôn ngữ do mô hình AI thực hiện theo tiêu chuẩn chặt; với dữ liệu giáo dục, nên để giáo viên tiếng Trung kiểm tra ngẫu nhiên một phần trước khi phát hành rộng.
