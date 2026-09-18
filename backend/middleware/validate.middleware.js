'use strict';

/**
 * middleware/validate.middleware.js
 * Thin wrapper over express-validator so controllers stay readable.
 */

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map(({ path: field, msg, location }) => ({ field, msg, location }));
  return next(ApiError.validation(details[0]?.msg || 'Invalid request.', details));
}

module.exports = validate;
