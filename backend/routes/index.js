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

const authRoutes = require('./auth.routes');
const postRoutes = require('./post.routes');
const userRoutes = require('./user.routes');
const commentRoutes = require('./comment.routes');
const reelRoutes = require('./reel.routes');
const storyRoutes = require('./story.routes');
const inviteRoutes = require('./invite.routes');

const router = express.Router();

/* ------------------------------- health ---------------------------------- */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || 'development',
      apiBase: urls.api.base,
      // Trạng thái email: 'ready' nghĩa là SMTP đã đăng nhập được.
      email: mailer.status(),
      timestamp: new Date().toISOString(),
    },
  });
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

logger.debug(`API routers mounted under ${urls.prefix.api}`);

module.exports = router;
