'use strict';

/**
 * controllers/comment.controller.js
 * Comments are public to any logged-in member; only the author (or an
 * admin) may delete one.
 */

const { Comment, Post, User } = require('../models');
const urls = require('../config/urls');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const telegram = require('../services/telegram.service');

const authorInclude = { model: User, as: 'author', attributes: ['id', 'username', 'fullName', 'avatarUrl'] };

/** GET /api/posts/:id/comments */
const listComments = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, { attributes: ['id'] });
  if (!post) throw ApiError.notFound('Post not found.');

  const comments = await Comment.findAll({
    where: { postId: post.id },
    include: [authorInclude],
    order: [['createdAt', 'ASC']],
    limit: 200,
  });

  res.json({
    success: true,
    data: { comments: comments.map((c) => c.toPublicJSON({ viewerId: req.user?.id, urls })) },
  });
});

/** POST /api/posts/:id/comments */
const createComment = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, {
    attributes: ['id', 'userId'],
    include: [{ model: User, as: 'author', attributes: ['id', 'username', 'fullName', 'locale'] }],
  });
  if (!post) throw ApiError.notFound('Post not found.');

  const comment = await Comment.create({
    postId: post.id,
    userId: req.user.id,
    body: req.body.body,
  });
  await comment.reload({ include: [authorInclude] });

  // Thông báo cho admin (không gửi cho chính người bình luận), theo ngôn ngữ
  // của chủ ảnh — hoặc của người bình luận nếu không xác định được.
  if (Number(post.userId) !== Number(req.user.id)) {
    telegram
      .notifyNewComment({
        authorName: req.user.fullName,
        photoOwner: post.author?.fullName,
        body: comment.body,
        locale: post.author?.locale || req.user.locale,
      })
      .catch(() => {});
  }

  res.status(201).json({
    success: true,
    data: { comment: comment.toPublicJSON({ viewerId: req.user.id, urls }) },
  });
});

/** DELETE /api/comments/:id */
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findByPk(req.params.id);
  if (!comment) throw ApiError.notFound('Comment not found.');

  const isOwner = Number(comment.userId) === Number(req.user.id);
  if (!isOwner && !req.user.isAdmin()) throw ApiError.forbidden('You can only delete your own comments.');

  await comment.destroy();
  res.json({ success: true, data: { deletedId: Number(req.params.id) } });
});

module.exports = { listComments, createComment, deleteComment };
