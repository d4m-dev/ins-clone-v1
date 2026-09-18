'use strict';

/**
 * routes/story.routes.js — "Khoảnh khắc 24 giờ", mount tại /api/stories.
 * Không có bảng riêng: story = bài đăng trong vòng 24 giờ qua, gom theo tác giả.
 * Nhờ vậy không cần job dọn dẹp — hết hạn là tự biến mất khỏi truy vấn.
 */

const express = require('express');

const postController = require('../controllers/post.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

/** GET /api/stories */
router.get('/', optionalAuth, postController.listStories);

module.exports = router;
