'use strict';

/**
 * config/database.js
 * ---------------------------------------------------------------------------
 * Sequelize instance factory. Credentials come exclusively from config/env.js
 * (which reads the .env file) — never hardcoded here.
 *
 * `define` enforces the shared conventions:
 *   - local timestamps, snake_case columns, plural table names.
 * ---------------------------------------------------------------------------
 */

const { Sequelize } = require('sequelize');
const { env } = require('./env');
const logger = require('../utils/logger');

/** SQLite (chỉ dùng cho test) không hỗ trợ timezone tuỳ chỉnh. */
const isSqlite = env.db.dialect === 'sqlite';

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect, // 'mariadb' (production) · 'sqlite' (test)
  ...(isSqlite ? { storage: env.db.storage } : {}),
  logging: env.db.logging ? (msg) => logger.debug(`[sql] ${msg}`) : false,
  pool: {
    max: env.db.poolMax,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
  define: {
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
  },
  dialectOptions: {
    // MariaDB on Termux: keep large base64 images (avatars) safe.
    supportBigNumbers: true,
    bigNumberStrings: false,
    // Termux/Android has no TLS to a local socket, but Cloudflare sits in
    // front of the *HTTP* layer only — DB traffic never leaves the device.
    ...(isSqlite ? {} : { timezone: 'local' }),
  },
  // Múi giờ của máy chủ — cấu hình bằng DB_TIMEZONE trong .env (mặc định +07:00).
  ...(isSqlite ? {} : { timezone: env.db.timezone }),
});

/** Retries the initial handshake — MariaDB (mysqld_safe) boots slower than Node. */
async function connectWithRetry({ retries = 20, delayMs = 1500 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await sequelize.authenticate();
      logger.success(`MariaDB connected → ${env.db.user}@${env.db.host}:${env.db.port}/${env.db.name}`);
      return sequelize;
    } catch (error) {
      const last = attempt === retries;
      logger.warn(
        `Database not ready (attempt ${attempt}/${retries}): ${error.message}${last ? '' : ` — retrying in ${delayMs}ms`}`
      );
      if (last) throw error;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return sequelize;
}

module.exports = { sequelize, Sequelize, connectWithRetry };
