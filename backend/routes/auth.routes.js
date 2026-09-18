'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { env } = require('../config/env');

const router = express.Router();

/** Brute-force protection on the two credential endpoints. */
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many attempts. Please try again in a few minutes.',
  },
});

const registerRules = [
  body('username')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9._]{3,30}$/)
    .withMessage('Username must be 3-30 characters (a-z, 0-9, "." or "_").'),
  body('fullName').trim().isLength({ min: 1, max: 80 }).withMessage('Full name is required.'),
  body('email').trim().isEmail().withMessage('A valid e-mail address is required.').normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8-72 characters.'),
];

const loginRules = [
  body('identifier').trim().notEmpty().withMessage('Username or e-mail is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

router.get('/config', authController.publicConfig);
router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.get('/me', requireAuth, authController.me);
router.patch(
  '/me',
  requireAuth,
  [
    body('locale').optional().isIn(['vi', 'en', 'zh']).withMessage('Ngôn ngữ không hợp lệ (vi, en, zh).'),
    body('bio').optional().trim().isLength({ max: 160 }),
    body('fullName').optional().trim().isLength({ min: 1, max: 80 }),
  ],
  validate,
  authController.updateMe
);

module.exports = router;
