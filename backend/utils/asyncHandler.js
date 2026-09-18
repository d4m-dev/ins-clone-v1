'use strict';

/**
 * utils/asyncHandler.js
 * Wraps async route handlers so rejected promises reach Express' error
 * middleware instead of crashing the process (no try/catch noise in controllers).
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
