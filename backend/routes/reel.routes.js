'use strict';

/**
 * routes/reel.routes.js — dòng video dọc (Reels), mount tại /api/reels.
 * Tách khỏi post.routes.js để '/reels' không bị route động '/:id' bắt mất.
 */

const express = require('express');
const { param } = require('express-validator');

const postController = require('../controllers/post.controller');
const validate = require('../middleware/validate.middleware');
const { optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

/** GET /api/reels?page=1&limit=6 */
router.get('/', optionalAuth, postController.listReels);

/** GET /api/reels/:id — một Reels kèm bình luận (mở từ thông báo Telegram). */
router.get(
  '/:id',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Mã không hợp lệ.').toInt()],
  validate,
  postController.getPost
);

module.exports = router;
