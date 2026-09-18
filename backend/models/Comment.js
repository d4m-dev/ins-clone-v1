'use strict';

/**
 * models/Comment.js — a comment below a post.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define(
    'Comment',
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
      body: {
        type: DataTypes.STRING(400),
        allowNull: false,
        validate: { len: { args: [1, 400], msg: 'Comment must be 1-400 characters.' } },
        set(value) {
          this.setDataValue('body', String(value ?? '').trim());
        },
      },
    },
    {
      tableName: 'comments',
      indexes: [{ fields: ['post_id'] }, { fields: ['user_id'] }],
    }
  );

  Comment.prototype.toPublicJSON = function toPublicJSON({ viewerId = null, urls } = {}) {
    const author = this.author || this.User || null;
    return {
      id: Number(this.id),
      postId: Number(this.postId),
      body: this.body,
      createdAt: this.createdAt,
      canDelete: viewerId != null && Number(this.userId) === Number(viewerId),
      author: author
        ? {
            id: Number(author.id),
            username: author.username,
            fullName: author.fullName,
            avatarUrl: urls.uploads.absolute(author.avatarUrl),
          }
        : null,
    };
  };

  return Comment;
};
