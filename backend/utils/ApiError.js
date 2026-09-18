'use strict';

/**
 * utils/ApiError.js
 * Errors thrown by controllers are instances of this class. The global error
 * middleware understands them and converts them into a stable JSON envelope:
 *
 *   { success: false, message: "...", code: "NOT_FOUND", details: [...] }
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message    human readable (safe to expose)
   * @param {object} [options]  { code, details, cause }
   */
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code || ApiError.codeFromStatus(statusCode);
    this.details = options.details ?? null;
    this.isOperational = true;
    if (options.cause) this.cause = options.cause;
    Error.captureStackTrace?.(this, ApiError);
  }

  static codeFromStatus(status) {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        422: 'VALIDATION_ERROR',
        429: 'TOO_MANY_REQUESTS',
      }[status] || 'INTERNAL_ERROR'
    );
  }

  static badRequest(message, details) {
    return new ApiError(400, message, { details });
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You are not allowed to perform this action') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message, details) {
    return new ApiError(409, message, { details });
  }
  static validation(message = 'Validation failed', details) {
    return new ApiError(422, message, { details });
  }
  static tooLarge(message = 'File is too large') {
    return new ApiError(413, message);
  }
}

module.exports = ApiError;
