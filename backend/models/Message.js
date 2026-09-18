'use strict';

/**
 * models/Message.js — một tin nhắn trong hội thoại.
 * ---------------------------------------------------------------------------
 * Nội dung có thể là:
 *   • chữ (tối đa CHAT_MAX_MESSAGE_LENGTH trong .env, mặc định 1000 ký tự),
 *   • ảnh (chụp/gửi từ thư viện — giống Instagram), hoặc cả hai (ảnh + chú thích).
 *
 * Quy ước quan trọng:
 *   • Database CHỈ lưu TÊN TỆP, không lưu URL — đổi domain là việc của
 *     config/urls.js, không phải migrate dữ liệu (xem models/Post.js).
 *   • "Thu hồi tin nhắn": xoá MỀM (deletedAt) và xoá luôn nội dung trong cùng
 *     câu UPDATE, để dù có đọc thẳng database cũng không lấy lại được chữ đã thu hồi.
 *   • `readAt` là mốc người NHẬN đã xem tin (1-1 nên một cột là đủ) → hiện "Đã xem".
 * ---------------------------------------------------------------------------
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define(
    'Message',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      conversationId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      senderId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },

      /* ------------------------------ nội dung ---------------------------- */
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: `Chữ trong tin nhắn (≤ ${process.env.CHAT_MAX_MESSAGE_LENGTH || 1000} ký tự)`,
      },
      attachmentFilename: {
        type: DataTypes.STRING(191),
        allowNull: true,
        comment: 'Tên tệp trong uploads/chat/ — KHÔNG lưu URL',
      },
      attachmentType: {
        type: DataTypes.ENUM('image', 'video'),
        allowNull: true,
      },
      attachmentWidth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      attachmentHeight: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** Chia sẻ một bài đăng vào hội thoại → hiển thị thẻ bài viết (kiểu Instagram). */
      sharedPostId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: 'FK mềm tới posts.id — cố ý không ràng buộc để xoá bài không lỗi',
      },

      /* ------------------------------- trạng thái ------------------------- */
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Người nhận đã xem tin này lúc nào ("Đã xem")',
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Thu hồi tin nhắn (xoá mềm, nội dung đã bị xoá khỏi bảng)',
      },
    },
    {
      tableName: 'messages',
      underscored: true,
      indexes: [
        { fields: ['conversation_id', 'id'] },
        { fields: ['conversation_id', 'read_at'] },
        { fields: ['sender_id'] },
      ],
    }
  );

  /* ------------------------------ tiện ích -------------------------------- */

  Message.prototype.isDeleted = function isDeleted() {
    return Boolean(this.deletedAt);
  };

  /**
   * Bản JSON an toàn để gửi ra API.
   * `urls` được truyền vào (không require ở đây) để model không phụ thuộc config.
   */
  Message.prototype.toPublicJSON = function toPublicJSON({ viewerId = null, urls } = {}) {
    const mine = viewerId !== null && Number(this.senderId) === Number(viewerId);
    return {
      id: Number(this.id),
      conversationId: Number(this.conversationId),
      senderId: Number(this.senderId),
      mine,
      body: this.isDeleted() ? null : this.body,
      isDeleted: this.isDeleted(),
      attachmentUrl:
        !this.isDeleted() && this.attachmentFilename && urls?.uploads?.chat
          ? urls.uploads.chat.file(this.attachmentFilename)
          : null,
      attachmentType: this.isDeleted() ? null : this.attachmentType,
      sharedPostId: this.isDeleted() ? null : this.sharedPostId ? Number(this.sharedPostId) : null,
      attachmentWidth: this.attachmentWidth ? Number(this.attachmentWidth) : null,
      attachmentHeight: this.attachmentHeight ? Number(this.attachmentHeight) : null,
      /** Với người gửi: người kia đã xem chưa. Với người nhận: luôn true. */
      seen: mine ? Boolean(this.readAt) : true,
      readAt: this.readAt,
      createdAt: this.createdAt,
    };
  };

  return Message;
};
