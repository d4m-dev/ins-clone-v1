/**
 * routes/invite.routes.js — lời mời tham gia cộng đồng.
 * ---------------------------------------------------------------------------
 *   POST   /api/invites             (admin)   tạo lời mời + gửi email
 *   GET    /api/invites             (admin)   danh sách kèm trạng thái
 *   GET    /api/invites/stats       (admin)   đếm pending/accepted/expired
 *   DELETE /api/invites/:id         (admin)   thu hồi
 *   GET    /api/invites/:token      (công khai) trang đăng ký kiểm tra lời mời
 *
 * THỨ TỰ QUAN TRỌNG: `/:token` khớp với mọi chuỗi, nên các route admin phải
 * được khai báo TRƯỚC nó — nếu không, `/api/invites/stats` sẽ bị hiểu là một
 * token và rơi vào tay middleware công khai.
 * ---------------------------------------------------------------------------
 */

'use strict';

const express = require('express');
const { body } = require('express-validator');
const inviteController = require('../controllers/invite.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

/** Gác quyền quản trị cho từng route (không dùng router.use để chừa route công khai). */
const admin = [requireAuth, requireAdmin];

/* ------------------------------- admin ------------------------------------ */

router.get('/stats', admin, inviteController.stats);
router.get('/', admin, inviteController.listInvites);

router.post(
  '/',
  admin,
  [
    body('email').trim().isEmail().withMessage('Email người được mời không hợp lệ.').normalizeEmail(),
    body('role').optional().isIn(['member', 'admin']).withMessage('Vai trò không hợp lệ.'),
    body('message').optional().isLength({ max: 200 }).withMessage('Lời nhắn tối đa 200 ký tự.'),
  ],
  validate,
  inviteController.createInvite
);

router.delete('/:id', admin, inviteController.revokeInvite);

/* --------------------------- công khai (cuối cùng) ------------------------ */

// Người được mời CHƯA có tài khoản — route này phải để mở, và chỉ tiết lộ
// đúng những gì cần cho trang đăng ký (email, vai trò, người mời, hạn dùng).
router.get('/:token', inviteController.checkInvite);

module.exports = router;
