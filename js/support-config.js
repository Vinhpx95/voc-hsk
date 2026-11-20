/*
 * Cấu hình "Tài liệu học tập" (#resources-modal) và "Mời tác giả ly trà" (#donate-modal), dùng chung PAYMENT_CONFIG.
 *
 * LƯU Ý: khi thông tin bên dưới còn là MẪU (số tài khoản 0123456789 / tên NGUYEN VAN A), các nút mở 2 cửa sổ này
 * tự ẩn trên trang thật (chỉ hiện khi chạy ở localhost để xem thử) → không ai chuyển nhầm vào tài khoản mẫu.
 */
window.SUPPORT_CONFIG = {
  PAYMENT_CONFIG: {
    // Mã ngân hàng theo VietQR (cột "code" hoặc "bin" tại https://api.vietqr.io/v2/banks), ví dụ: MB, VCB, TCB, ACB, 970422…
    bankId: 'MB',
    bankName: 'MB Bank',            // tên hiển thị cho người dùng
    accountNo: '0123456789',        // số tài khoản
    accountName: 'NGUYEN VAN A',    // tên chủ tài khoản: VIẾT HOA, KHÔNG DẤU
    contactLink: 'https://zalo.me/...'  // Zalo / Telegram để gửi file nhanh
  },

  /*
   * Gói tài liệu. deliveryLink: link tải (Google Drive…) mở ngay khi người mua bấm "Nhận tài liệu".
   * Để trống '' → nút mở contactLink, người mua nhắn mã đơn để bạn kiểm tra rồi gửi file.
   * (Trang web tĩnh không tự xác nhận được giao dịch, nên đặt deliveryLink nghĩa là tin người mua.)
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
      description: 'File PDF in ra giấy gồm ô điền mễ, thứ tự nét bút, Pinyin & âm Hán-Việt cho toàn bộ từ vựng sơ cấp.',
      deliveryLink: ''
    },
    {
      id: 'audio',
      icon: 'bi-headphones',
      name: 'Bộ Audio Nghe Thụ Động Song Ngữ',
      format: 'MP3',
      price: 39000,
      badge: '',
      codePrefix: 'AUDIO',
      description: 'Tổng hợp file MP3 đọc từ vựng, nghĩa tiếng Việt và câu ví dụ chia theo từng bài để nghe khi đi đường.',
      deliveryLink: ''
    },
    {
      id: 'combo',
      icon: 'bi-box2-heart',
      name: 'Full Combo Trọn Bộ HSK 1–6 & 214 Bộ Thủ',
      format: 'PDF + MP3 + Ebook',
      price: 59000,
      originalPrice: 99000,
      badge: 'Khuyên dùng',
      codePrefix: 'COMBO',
      description: 'Trọn bộ PDF Luyện viết HSK 1–6 + Full Audio Nghe thụ động + Ebook Sổ tay 214 Bộ thủ chiết tự nhớ nhanh.',
      deliveryLink: '',
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
