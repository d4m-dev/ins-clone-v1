'use strict';

/**
 * middleware/error.middleware.js
 * ---------------------------------------------------------------------------
 * Two terminal middlewares:
 *   notFoundHandler → converts unknown routes into a JSON 404
 *   errorHandler    → normalises every failure into the API error envelope and
 *                     deletes orphaned uploads when a request dies mid-way.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs/promises');
const multer = require('multer');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} does not exist.`));
}

/** Removes the file multer already wrote when the handler later failed. */
async function cleanupUploadedFile(req) {
  if (!req.file?.path) return;
  try {
    await fs.unlink(req.file.path);
    logger.warn(`Removed orphaned upload: ${req.file.path}`);
  } catch {
    /* file already gone — nothing to do */
  }
}

// eslint-disable-next-line no-unused-vars
async function errorHandler(err, req, res, next) {
  let error = err;

  // --- translation layer ---------------------------------------------------
  if (err instanceof multer.MulterError) {
    error =
      err.code === 'LIMIT_FILE_SIZE'
        ? ApiError.tooLarge(`Image is larger than ${env.uploads.maxSizeMb} MB.`)
        : ApiError.badRequest(`Upload rejected: ${err.message}`);
  } else if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    error = ApiError.validation(
      err.errors?.[0]?.message || 'Database validation failed.',
      err.errors?.map((item) => ({ field: item.path, msg: item.message }))
    );
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    error = ApiError.badRequest('Related record is missing.');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(500, env.isProd ? 'Unexpected server error.' : err.message || 'Unexpected server error.', {
      cause: err,
    });
  }

  if (req.file) await cleanupUploadedFile(req);

  const status = error.statusCode || 500;
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${status}: ${err.stack || err.message}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status}: ${error.message}`);
  }

  res.status(status).json({
    success: false,
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
    ...(env.isProd ? {} : { stack: err.stack?.split('\n').slice(0, 4) }),
  });
}

module.exports = { notFoundHandler, errorHandler };
