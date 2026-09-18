'use strict';

/**
 * routes/post.routes.js
 * ---------------------------------------------------------------------------
 * LƯU Ý THỨ TỰ KHAI BÁO: các route tĩnh ('/stats') phải đứng TRƯỚC route động
 * ('/:id'), nếu không Express sẽ khớp '/stats' vào :id rồi báo lỗi validate.
 * ---------------------------------------------------------------------------
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');

const postController = require('../controllers/post.controller');
const commentController = require('../controllers/comment.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, optionalAuth } = require('../middleware/auth.middleware');
const { postMediaUploader, handleUploadErrors } = require('../middleware/upload.middleware');
const { env } = require('../config/env');

const router = express.Router();

/** Giới hạn riêng cho việc đăng bài: video nặng hơn ảnh rất nhiều. */
const uploadLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.uploadMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Bạn đăng hơi nhanh rồi, thử lại sau vài phút nhé.',
  },
});

const idParam = [param('id').isInt({ min: 1 }).withMessage('Mã không hợp lệ.').toInt()];

/** Các trường tệp cho một bài đăng: ảnh/ảnh bìa · video · nhạc nền. */
const mediaFields = postMediaUploader.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

/* -------------------------------- bảng tin -------------------------------- */
router.get('/', optionalAuth, postController.listPosts);
router.get('/stats', optionalAuth, postController.getStats);

/* -------------------------- đăng ảnh / video (Reels) ---------------------- */
router.post(
  '/',
  requireAuth,
  uploadLimiter,
  mediaFields,
  handleUploadErrors,
  [
    body('caption')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 500 })
      .withMessage('Chú thích tối đa 500 ký tự.'),
    body('location')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 120 })
      .withMessage('Địa điểm tối đa 120 ký tự.'),
    body('audioTitle')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 120 })
      .withMessage('Tên nhạc tối đa 120 ký tự.'),
    body('durationSeconds')
      .optional({ values: 'falsy' })
      .isFloat({ min: 0, max: 600 })
      .withMessage('Thời lượng không hợp lệ.'),
  ],
  validate,
  postController.createPost
);

/* ----------------------------- thích & bình luận -------------------------- */
router.post('/:id/likes', requireAuth, idParam, validate, postController.toggleLike);

router.get('/:id/comments', optionalAuth, idParam, validate, commentController.listComments);
router.post(
  '/:id/comments',
  requireAuth,
  idParam,
  [body('body').trim().isLength({ min: 1, max: 400 }).withMessage('Bình luận phải từ 1-400 ký tự.')],
  validate,
  commentController.createComment
);

/* --------------------------- xem · đếm · tải về --------------------------- */
router.post('/:id/views', optionalAuth, idParam, validate, postController.incrementViews);
router.get('/:id/download', optionalAuth, idParam, validate, postController.downloadPost);

/* ---------------------------- chi tiết & xoá ----------------------------- */
router.get('/:id', optionalAuth, idParam, validate, postController.getPost);
router.delete('/:id', requireAuth, idParam, validate, postController.deletePost);

module.exports = router;
