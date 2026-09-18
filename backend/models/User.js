'use strict';

/**
 * models/User.js — the family member.
 * Passwords are ALWAYS stored as a bcrypt hash; the plain value never touches
 * the database and is never returned by the API (`defaultScope`).
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const urls = require('../config/urls');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
        validate: {
          is: {
            args: /^[a-z0-9._]{3,30}$/,
            msg: 'Username may only contain lowercase letters, numbers, dots and underscores.',
          },
        },
        set(value) {
          this.setDataValue('username', String(value || '').trim().toLowerCase());
        },
      },
      fullName: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: { len: { args: [1, 80], msg: 'Full name is required.' } },
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: 'A valid e-mail address is required.' } },
        set(value) {
          this.setDataValue('email', String(value || '').trim().toLowerCase());
        },
      },
      password: {
        type: DataTypes.STRING(72),
        allowNull: false,
        validate: { len: { args: [8, 72], msg: 'Password must be at least 8 characters.' } },
      },
      avatarUrl: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Filename inside uploads/ (avatars/ subfolder).',
      },
      bio: {
        type: DataTypes.STRING(160),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('member', 'admin'),
        allowNull: false,
        defaultValue: 'member',
      },
      locale: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: 'vi',
        comment: 'Ngôn ngữ của thành viên: vi | en | zh (thông báo Telegram, email).',
        validate: { isIn: { args: [['vi', 'en', 'zh']], msg: 'Unsupported language.' } },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Admins can soft-disable a member from AdminJS.',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'users',
      indexes: [{ fields: ['username'] }, { fields: ['email'] }],
      defaultScope: {
        attributes: { exclude: ['password'] },
      },
      scopes: {
        // Only the login flow and password changes may read the hash.
        withPassword: { attributes: { include: ['password'] } },
      },
      hooks: {
        beforeSave: async (user) => {
          if (user.changed('password')) {
            const rounds = env.auth.saltRounds;
            user.password = await bcrypt.hash(user.password, rounds);
          }
        },
      },
    }
  );

  /**
   * Compares a plain password with the stored hash.
   * Returns false when the instance was loaded WITHOUT the `withPassword`
   * scope (the default scope strips the hash for safety).
   */
  User.prototype.verifyPassword = function verifyPassword(plain) {
    if (!this.password || !plain) return false;
    return bcrypt.compare(plain, this.password);
  };

  /** Minimal, safe representation sent to the frontend. */
  User.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: Number(this.id),
      username: this.username,
      fullName: this.fullName,
      // URL TUYỆT ĐỐI kèm thư mục avatars/ — tránh lỗi 404 ở client.
      avatarUrl: urls.uploads.avatar(this.avatarUrl),
      avatarFilename: this.avatarUrl,
      bio: this.bio,
      locale: this.locale,
      role: this.role,
      createdAt: this.createdAt,
    };
  };

  User.prototype.isAdmin = function isAdmin() {
    return this.role === 'admin';
  };

  return User;
};
