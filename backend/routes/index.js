'use strict';

/**
 * routes/index.js
 * Mounts every feature router under the prefix declared in config/urls.js —
 * routers themselves never hardcode a path segment.
 */

const express = require('express');
const urls = require('../config/urls');
const logger = require('../utils/logger');
const mailer = require('../services/mailer.service');
const storage = require('../services/storage.service');

const authRoutes = require('./auth.routes');
const postRoutes = require('./post.routes');
const userRoutes = require('./user.routes');
const commentRoutes = require('./comment.routes');
const reelRoutes = require('./reel.routes');
const storyRoutes = require('./story.routes');
const inviteRoutes = require('./invite.routes');
const chatRoutes = require('./chat.routes');

const router = express.Router();

/* ------------------------------- health ---------------------------------- */
router.get('/health', async (_req, res, next) => {
  try {
    // Máy chủ này là một chiếc điện thoại: đầy đĩa là sập, nên /health phải
    // nói được còn bao nhiêu chỗ trống và có đang ở mức cảnh báo hay không.
    const health = await storage.checkStorageHealth();
    const chat = require('../services/realtime.service');

    res.json({
      success: true,
      data: {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        env: process.env.NODE_ENV || 'development',
        apiBase: urls.api.base,
        // Trạng thái email: 'ready' nghĩa là SMTP đã đăng nhập được.
        email: mailer.status(),
        storage: {
          files: health.files,
          videos: health.videos,
          megabytes: health.megabytes,
          disk: health.disk,
          warning: health.warning,
        },
        // Số kết nối chat realtime đang mở (SSE).
        realtime: chat.stats(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------- features -------------------------------- */
router.use('/auth', authRoutes);
router.use('/posts', postRoutes);
router.use('/users', userRoutes);
router.use('/comments', commentRoutes);
/** Reels (video dọc) — khai báo riêng để không đụng route động '/posts/:id'. */
router.use('/reels', reelRoutes);
/** Khoảnh khắc 24 giờ. */
router.use('/stories', storyRoutes);
router.use('/invites', inviteRoutes);
/**
 * Chat 1-1 + kênh realtime SSE. Khai báo SAU cùng để các đoạn tĩnh
 * ('/summary', '/people', '/messages') không đụng các router khác.
 */
router.use('/chat', chatRoutes);

logger.debug(`API routers mounted under ${urls.prefix.api}`);

module.exports = router;
