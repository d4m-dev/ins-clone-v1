'use strict';

/**
 * models/Like.js — one row per (user, post).
 * A UNIQUE index prevents double-likes at the database level, so the API can
 * simply "toggle" without race conditions.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Like = sequelize.define(
    'Like',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      postId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'posts', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'likes',
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['user_id', 'post_id'], name: 'likes_user_post_unique' },
      ],
    }
  );

  return Like;
};
