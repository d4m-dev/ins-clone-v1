'use strict';

/**
 * routes/chat.routes.js — chat 1-1 (kiểu Instagram Direct).
 * ---------------------------------------------------------------------------
 * Toàn bộ router yêu cầu ĐĂNG NHẬP: chat luôn gắn với tài khoản, không có
 * khách xem. Riêng `/stream` (SSE) cần token vì EventSource của trình duyệt
 * KHÔNG gửi được header Authorization — xem middleware bên dưới.
 *
 * THỨ TỰ KHAI BÁO: các đoạn tĩnh ('/summary', '/people', '/stream', '/messages')
 * phải đứng trước đoạn động ('/conversations/:id') để không bị "nuốt" route.
 * ---------------------------------------------------------------------------
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');

const chatController = require('../controllers/chat.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { chatAttachmentUploader, handleUploadErrors, assertFileSizes } = require('../middleware/upload.middleware');
const { env } = require('../config/env');

const router = express.Router();

/**
 * Giới hạn riêng cho việc GỬI tin (mặc định 120 tin / 15 phút — env CHAT_RATE_LIMIT_MAX).
 * Hộp thư chỉ đọc thì không cần chặn, nhưng gửi thì phải có trần chống spam.
 */
const sendLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.chatMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || req.ip),
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Bạn gửi tin quá nhanh, vui lòng thử lại sau ít phút.',
  },
});

/* -------------------------------------------------------------------------- */
/*  EventSource không gửi được header → chấp nhận token qua query ?token=...   */
/* -------------------------------------------------------------------------- */
function streamAuth(req, res, next) {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return requireAuth(req, res, next);
}

/* ------------------------------- realtime --------------------------------- */

router.get('/stream', streamAuth, chatController.stream);

/* -------------------------- badge & tìm người ------------------------------ */

router.get('/summary', requireAuth, chatController.summary);
router.get('/people', requireAuth, [query('q').optional().isLength({ max: 60 }).trim()], validate, chatController.searchPeople);

/* ------------------------------ tin nhắn ---------------------------------- */

// Gửi nhanh không cần biết id hội thoại: { toUserId, body } — tiện cho nút
// "Chia sẻ vào tin nhắn" ở trang bài viết.
router.post(
  '/messages',
  requireAuth,
  sendLimiter,
  (req, res, next) =>
    chatAttachmentUploader.single('attachment')(req, res, (error) =>
      error ? handleUploadErrors(error, req, res, next) : next()
    ),
  [
    body('body').optional().isLength({ max: env.chat.maxMessageLength }).withMessage(
      `Tin nhắn tối đa ${env.chat.maxMessageLength} ký tự.`
    ),
    body('toUserId').exists({ checkFalsy: true }).withMessage('Thiếu người nhận.').isInt({ min: 1 }),
    body('sharedPostId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  ],
  validate,
  (req, _res, next) => {
    try {
      assertFileSizes({ attachment: req.file ? [req.file] : undefined });
      next();
    } catch (error) {
      next(error);
    }
  },
  chatController.sendMessage
);

router.delete('/messages/:id', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.deleteMessage);

/* ------------------------------ hội thoại --------------------------------- */

router.get('/conversations', requireAuth, chatController.listConversations);

router.post(
  '/conversations',
  requireAuth,
  [body('userId').exists({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Thiếu userId.')],
  validate,
  chatController.openConversation
);

router.get(
  '/conversations/:id/messages',
  requireAuth,
  [param('id').isInt({ min: 1 }), query('before').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })],
  validate,
  chatController.listMessages
);

router.post(
  '/conversations/:id/messages',
  requireAuth,
  sendLimiter,
  (req, res, next) =>
    chatAttachmentUploader.single('attachment')(req, res, (error) =>
      error ? handleUploadErrors(error, req, res, next) : next()
    ),
  [param('id').isInt({ min: 1 }), body('body').optional().isLength({ max: env.chat.maxMessageLength })],
  validate,
  (req, _res, next) => {
    try {
      assertFileSizes({ attachment: req.file ? [req.file] : undefined });
      next();
    } catch (error) {
      next(error);
    }
  },
  chatController.sendToConversation
);

router.post('/conversations/:id/typing', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.typing);
router.post('/conversations/:id/read', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.markRead);
router.post('/conversations/:id/accept', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.acceptRequest);
router.post('/conversations/:id/decline', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.declineRequest);
router.get('/conversations/:id', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.getConversation);
router.delete('/conversations/:id', requireAuth, [param('id').isInt({ min: 1 })], validate, chatController.hideConversation);

module.exports = router;
