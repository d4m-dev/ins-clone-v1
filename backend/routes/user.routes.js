'use strict';

const express = require('express');
const { param } = require('express-validator');

const postController = require('../controllers/post.controller');
const validate = require('../middleware/validate.middleware');
const { optionalAuth, requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * IMPORTANT: '/me/posts' must be declared BEFORE the parameterised route,
 * otherwise "me" would be captured by :identifier.
 */
router.get('/me/posts', requireAuth, postController.listMyPosts);

/**
 * Public profile + photo grid. The identifier accepts either the numeric id
 * or the username, e.g. /api/users/3/posts or /api/users/minh.nguyen/posts
 */
router.get(
  '/:identifier/posts',
  optionalAuth,
  [
    param('identifier')
      .trim()
      .toLowerCase()
      .matches(/^(\d+|[a-z0-9._]{3,30})$/)
      .withMessage('Invalid user identifier.'),
  ],
  validate,
  postController.listUserPosts
);

module.exports = router;
