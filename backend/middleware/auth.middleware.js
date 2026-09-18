'use strict';

/**
 * middleware/auth.middleware.js
 * Verifies the `Authorization: Bearer <jwt>` header and loads the user.
 */

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');

/** Signs an access token for a user id. */
function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    env.auth.jwtSecret,
    { expiresIn: env.auth.jwtExpiresIn }
  );
}

/** Hard gate: request is rejected when no valid token is present. */
async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw ApiError.unauthorized('Missing bearer token.');

    let payload;
    try {
      payload = jwt.verify(token, env.auth.jwtSecret);
    } catch (error) {
      throw ApiError.unauthorized(
        error.name === 'TokenExpiredError' ? 'Session expired, please log in again.' : 'Invalid token.'
      );
    }

    const user = await User.findByPk(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists.');
    if (!user.isActive) throw ApiError.forbidden('This account has been disabled by the administrator.');

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Soft gate: attaches req.user when a token exists, never fails. */
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7).trim(), env.auth.jwtSecret);
    req.user = await User.findByPk(payload.sub);
  } catch {
    req.user = null;
  }
  return next();
}

/** Requires an admin (used by API endpoints that mirror AdminJS powers). */
function requireAdmin(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isAdmin()) return next(ApiError.forbidden('Administrator privileges required.'));
  return next();
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin };
