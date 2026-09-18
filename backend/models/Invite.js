/**
 * models/Invite.js — lời mời tham gia gia đình.
 * ---------------------------------------------------------------------------
 * Chỉ lưu HASH của token. Token gốc chỉ tồn tại trong email và trên máy người
 * nhận — mất database cũng không chiếm được tài khoản.
 * Trạng thái: pending → accepted | revoked | (hết hạn theo expiresAt).
 * ---------------------------------------------------------------------------
 */

'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invite = sequelize.define(
    'Invite',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        validate: { isEmail: { msg: 'A valid e-mail address is required.' } },
        set(value) {
          this.setDataValue('email', String(value || '').trim().toLowerCase());
        },
      },
      /** SHA-256 của token trong liên kết mời. */
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      role: {
        type: DataTypes.ENUM('member', 'admin'),
        allowNull: false,
        defaultValue: 'member',
      },
      message: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: 'Lời nhắn kèm theo (tuỳ chọn) khi quản trị viên mời.',
      },
      invitedById: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      acceptedByUserId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'invites',
      // ⚠️ `underscored: true` ở cấp sequelize ⇒ index phải dùng TÊN CỘT
      // (snake_case), không phải tên thuộc tính — nếu không SQLite/MySQL sẽ
      // báo "no such column: tokenHash" lúc sync.
      indexes: [{ fields: ['email'] }, { fields: ['token_hash'] }],
      defaultScope: {
        // Không bao giờ trả tokenHash ra API.
        attributes: { exclude: ['tokenHash'] },
      },
      scopes: {
        withToken: { attributes: { include: ['tokenHash'] } },
      },
    }
  );

  Invite.prototype.isUsable = function isUsable() {
    if (this.acceptedAt || this.revokedAt) return false;
    return new Date(this.expiresAt).getTime() > Date.now();
  };

  /** Trạng thái suy ra, dùng cho AdminJS và API. */
  Invite.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: Number(this.id),
      email: this.email,
      role: this.role,
      message: this.message,
      invitedById: Number(this.invitedById),
      status: this.revokedAt
        ? 'revoked'
        : this.acceptedAt
          ? 'accepted'
          : this.isUsable()
            ? 'pending'
            : 'expired',
      expiresAt: this.expiresAt,
      acceptedAt: this.acceptedAt,
      createdAt: this.createdAt,
    };
  };

  return Invite;
};
