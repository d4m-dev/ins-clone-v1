'use strict';

/**
 * models/Conversation.js — một cuộc trò chuyện 1-1 (giống hộp thư Instagram).
 * ---------------------------------------------------------------------------
 * Vì sao chỉ 1-1? Instagram Direct cốt lõi là nhắn riêng từng người; nhóm chat
 * là bước sau. Mô hình 1-1 cho phép ràng buộc chặt: mỗi cặp người dùng chỉ có
 * ĐÚNG MỘT cuộc trò chuyện, nhờ khoá duy nhất `pairKey`.
 *
 * Quy ước:
 *   • `pairKey` = "<id nhỏ>:<id lớn>" → tìm nhanh, không bao giờ tạo trùng.
 *   • `status`  = 'requested' (tin nhắn chờ) · 'accepted' (bình thường) · 'declined'
 *     Instagram cũng vậy: người lạ nhắn lần đầu thì tin nhắn nằm trong "Tin nhắn chờ",
 *     người nhận bấm Đồng ý mới thành hội thoại bình thường.
 *   • Đã đọc: mỗi người có mốc thời gian riêng (`userOneReadAt` / `userTwoReadAt`),
 *     số tin chưa đọc = các tin của NGƯỜI KIA sau mốc đó (tính bằng 1 câu COUNT).
 *   • Xoá hội thoại khỏi hộp thư: đặt `userOneHiddenAt` — tin nhắn mới (có
 *     createdAt lớn hơn) sẽ tự làm hội thoại hiện lại, đúng hành vi Instagram.
 * ---------------------------------------------------------------------------
 */

const { DataTypes } = require('sequelize');

/** Chuẩn hoá cặp id: luôn "<nhỏ>:<lớn>" để hai chiều cho cùng một khoá. */
function pairKeyFor(firstId, secondId) {
  const a = Number(firstId);
  const b = Number(secondId);
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

module.exports = (sequelize) => {
  const Conversation = sequelize.define(
    'Conversation',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      /** "<id nhỏ>:<id lớn>" — UNIQUE, chống tạo 2 hội thoại cho cùng một cặp. */
      pairKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      userOneId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      userTwoId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM('requested', 'accepted', 'declined'),
        allowNull: false,
        defaultValue: 'accepted',
        comment: 'requested = tin nhắn chờ người nhận đồng ý',
      },
      /** Ai là người khởi tạo (quyết định ai được chấp nhận / từ chối). */
      requestedById: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },

      /* --------------------------- trạng thái đọc -------------------------- */
      userOneReadAt: { type: DataTypes.DATE, allowNull: true },
      userTwoReadAt: { type: DataTypes.DATE, allowNull: true },

      /* ------------------------ ẩn khỏi hộp thư ---------------------------- */
      userOneHiddenAt: { type: DataTypes.DATE, allowNull: true },
      userTwoHiddenAt: { type: DataTypes.DATE, allowNull: true },

      /* ---------------------------- tin cuối ------------------------------- */
      /**
       * Bản CHỤP LẠI tin cuối cùng (denormalized snapshot).
       * Vì sao? Hộp thư cần "người gửi + trích đoạn + thời gian" cho từng dòng.
       * Nếu join bảng messages với LIMIT 1 cho mỗi hội thoại thì máy chủ chạy
       * trên điện thoại sẽ phải N+1 truy vấn. Chụp sẵn ở đây → 1 truy vấn duy nhất.
       * Không đặt khoá ngoại cho lastMessageId để tránh phụ thuộc vòng.
       */
      lastMessageId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      lastMessageSenderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      lastMessagePreview: {
        type: DataTypes.STRING(160),
        allowNull: true,
        comment: 'Trích đoạn chữ, hoặc "📷 Ảnh" / "🎥 Video" / "Bài viết"',
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Sắp xếp hộp thư; cập nhật mỗi lần có tin mới',
      },
    },
    {
      tableName: 'conversations',
      underscored: true,
      indexes: [
        { fields: ['user_one_id', 'last_message_at'] },
        { fields: ['user_two_id', 'last_message_at'] },
        { unique: true, fields: ['pair_key'], name: 'conversations_pair_unique' },
      ],
    }
  );

  /* ------------------------------ tiện ích -------------------------------- */

  Conversation.prototype.isMember = function isMember(userId) {
    const id = Number(userId);
    return Number(this.userOneId) === id || Number(this.userTwoId) === id;
  };

  Conversation.prototype.peerIdOf = function peerIdOf(userId) {
    const id = Number(userId);
    return Number(this.userOneId) === id ? Number(this.userTwoId) : Number(this.userOneId);
  };

  /** Mốc đã đọc của người dùng này (so sánh với createdAt của tin nhắn). */
  Conversation.prototype.readAtFor = function readAtFor(userId) {
    const id = Number(userId);
    return Number(this.userOneId) === id ? this.userOneReadAt : this.userTwoReadAt;
  };

  Conversation.prototype.hiddenAtFor = function hiddenAtFor(userId) {
    const id = Number(userId);
    return Number(this.userOneId) === id ? this.userOneHiddenAt : this.userTwoHiddenAt;
  };

  /** Cập nhật mốc đã đọc cho một người (ghi vào cột đúng của người đó). */
  Conversation.prototype.markReadBy = function markReadBy(userId, when = new Date()) {
    const id = Number(userId);
    if (Number(this.userOneId) === id) this.userOneReadAt = when;
    else this.userTwoReadAt = when;
    return this;
  };

  Conversation.prototype.hideFor = function hideFor(userId, when = new Date()) {
    const id = Number(userId);
    if (Number(this.userOneId) === id) this.userOneHiddenAt = when;
    else this.userTwoHiddenAt = when;
    return this;
  };

  /**
   * Hội thoại này có đang bị ẩn khỏi hộp thư của người dùng không?
   * Tin nhắn MỚI hơn mốc ẩn ⇒ hiện lại (giống Instagram).
   */
  Conversation.prototype.isHiddenFor = function isHiddenFor(userId) {
    const hiddenAt = this.hiddenAtFor(userId);
    if (!hiddenAt) return false;
    if (!this.lastMessageAt) return true;
    return new Date(this.lastMessageAt).getTime() <= new Date(hiddenAt).getTime();
  };

  /** Ai được phép đồng ý/từ chối tin nhắn chờ? (người NHẬN, không phải người gửi) */
  Conversation.prototype.canRespondToRequest = function canRespondToRequest(userId) {
    if (this.status !== 'requested') return false;
    return Number(this.requestedById) !== Number(userId);
  };

  Conversation.pairKeyFor = pairKeyFor;

  return Conversation;
};
