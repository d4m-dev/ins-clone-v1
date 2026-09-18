'use strict';

const express = require('express');
const { param } = require('express-validator');

const commentController = require('../controllers/comment.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.delete(
  '/:id',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid comment id.').toInt()],
  validate,
  commentController.deleteComment
);

module.exports = router;
