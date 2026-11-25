/*
 * Cấu hình "Tài liệu học tập" (#resources-modal) và "Mời tác giả ly trà" (#donate-modal), dùng chung PAYMENT_CONFIG.
 *
 * LƯU Ý: khi thông tin bên dưới còn là MẪU (số tài khoản 0123456789 / tên NGUYEN VAN A), các nút mở 2 cửa sổ này
 * tự ẩn trên trang thật (trừ khi SHOW_SAMPLE: true — bản xem thử có nhãn "MẪU"), localhost thì luôn hiện.
 */
window.SUPPORT_CONFIG = {
  // Xem thử trên trang thật khi thông tin còn là mẫu: hiện các nút, ảnh QR có nhãn "MẪU" và nhắc người dùng chưa chuyển khoản.
  // Điền tài khoản thật rồi thì không cần quan tâm cờ này. Đặt false để ẩn hẳn các nút khi còn là mẫu.
  SHOW_SAMPLE: true,

  /*
   * Thông tin người bán, hiện ở trang Điều khoản & Chính sách (chinh-sach/) và hộp "Tài liệu học tập".
   * Website bán hàng phải công bố các thông tin này (Luật Thương mại điện tử 2025). Ô nào để trống thì trang ghi "Đang cập nhật".
   * Điền đủ trước khi thông báo website với cơ quan quản lý.
   */
  SELLER: {
    name: 'Phạm Xuân Vinh',                              // họ tên người bán hoặc tên hộ kinh doanh, có dấu, ví dụ: Hộ kinh doanh Voc-Lang
    owner: '',                                           // chủ hộ kinh doanh (nếu là hộ kinh doanh)
    taxCode: '024095009683',                             // mã số thuế
    address: 'TDP Tân Thịnh, Phường Kép, Bắc Ninh',      // địa chỉ liên hệ
    phone: '',                                           // số điện thoại (không bắt buộc)
    email: 'voclang.hsk@gmail.com'                       // email nhận hỗ trợ, khiếu nại và yêu cầu về dữ liệu cá nhân
  },
  POLICY_URL: 'chinh-sach/',           // trang Điều khoản & Chính sách (đường dẫn tương đối từ trang học)

  PAYMENT_CONFIG: {
    // Mã ngân hàng theo VietQR (cột "code" hoặc "bin" tại https://api.vietqr.io/v2/banks), ví dụ: MB, VCB, TCB, ACB, 970422…
    bankId: '970407',
    bankName: 'Ngân hàng Thương mại Cổ phần Kỹ thương Việt Nam (Techcombank)',            // tên hiển thị cho người dùng
    accountNo: '19077757522016',        // số tài khoản
    accountName: 'PHAM XUAN VINH'     // tên chủ tài khoản: VIẾT HOA, KHÔNG DẤU
  },

  /*
   * Gói tài liệu. Người mua đăng nhập Google → web lưu đơn orders/{uid}_{id} (js/support.js, firestore.rules);
   * bấm "Đã chuyển khoản" → chủ trang nhận email, kiểm tra tài khoản rồi gửi link tải từ trang quản trị (admin-report/).
   * id phải là một trong hsk13 | audio | combo (Rules kiểm tra). codePrefix nằm trong nội dung chuyển khoản.
   */
  DIGITAL_PRODUCTS: [
    {
      id: 'hsk13',
      icon: 'bi-pencil-square',
      name: 'Vở Luyện Viết Chữ Hán HSK 1–3',
      format: 'PDF',
      price: 29000,
      badge: 'Bán chạy',
      codePrefix: 'HSK13',
      description: '3 file PDF A4 (224 trang) luyện 1.068 chữ Hán HSK 1–3: ô điền mễ, thứ tự từng nét, pinyin, âm Hán-Việt và từ HSK có chữ đó.'
    },
    {
      id: 'audio',
      icon: 'bi-headphones',
      name: 'Bộ Audio Nghe Thụ Động Song Ngữ HSK 1–6',
      format: 'MP3 + PDF',
      price: 39000,
      badge: '',
      codePrefix: 'AUDIO',
      description: '228 bài MP3 (~22 giờ) cho 5.671 từ HSK 1–6: mỗi từ đọc 2 lần, nghĩa tiếng Việt, câu ví dụ và nghĩa câu. Kèm PDF danh sách từ theo bài để nhìn theo khi nghe.'
    },
    {
      id: 'combo',
      icon: 'bi-box2-heart',
      name: 'Full Combo Trọn Bộ HSK 1–6 & 214 Bộ Thủ',
      format: 'PDF + MP3',
      price: 59000,
      originalPrice: 99000,
      badge: 'Khuyên dùng',
      codePrefix: 'COMBO',
      description: 'Vở luyện viết HSK 1–6 (2.701 chữ, 560 trang) + toàn bộ audio (228 bài, ~22 giờ) + Sổ tay 214 bộ thủ (77 trang, chiết tự nhớ nhanh).',
      default: true                 // gói được chọn sẵn
    }
  ],

  /* Mời tác giả ly trà. amount: null = ô tự nhập. */
  DONATE_TIERS: [
    { amount: 15000, label: '🥤 1 ly trà chanh' },
    { amount: 30000, label: '🧋 1 ly trà sữa', badge: 'Phổ biến', default: true },
    { amount: 50000, label: '☕ 1 cốc cà phê xịn' },
    { amount: null, label: '💖 Tùy nhập' }
  ],
  DONATE_MIN: 10000,
  DONATE_MESSAGE: 'Ung ho duy tri web'
};
