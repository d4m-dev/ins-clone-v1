'use strict';

/**
 * server.js — PixGram backend entry point
 * ===========================================================================
 * One process that boots everything:
 *   1. config/env.js        → .env validation
 *   2. config/database.js   → Sequelize + MariaDB (with retry)
 *   3. models/index.js      → schema sync + associations
 *   4. Express app          → /uploads static, /api JSON, /admin AdminJS
 *   5. services/telegram    → bot polling in the SAME process
 *
 * Started by `npm start` (concurrently) together with mysqld_safe and
 * cloudflared. No URL, path, secret or credential is hardcoded: everything
 * comes from .env via config/env.js and config/urls.js.
 * ===========================================================================
 */

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { env, assertProductionSecrets } = require('./config/env');
const urls = require('./config/urls');
const logger = require('./utils/logger');
const { connectWithRetry } = require('./config/database');
const { sequelize } = require('./models');
const { createUploadsRouter } = require('./middleware/static.middleware');
const { ensureUploadFolders } = require('./services/storage.service');
const storage = require('./services/storage.service');
const telegram = require('./services/telegram.service');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { localeMiddleware, SUPPORTED: SUPPORTED_LOCALES } = require('./utils/locale');
const { buildAdminRouter } = require('./admin/adminjs.config');

const app = express();
let httpServer = null;

/* -------------------------------------------------------------------------- */
/*                             1. Security                                    */
/* -------------------------------------------------------------------------- */

/**
 * Helmet defaults + two deliberate relaxations:
 *   • crossOriginResourcePolicy: 'cross-origin'  → the Vercel origin must be
 *     able to embed images served from api.d4mdev.click.
 *   • contentSecurityPolicy: false for /admin only, because AdminJS is a
 *     bundled React SPA that loads inline scripts.
 */
function applySecurityHeaders() {
  app.use(
    helmet({
      contentSecurityPolicy: false, // AdminJS needs inline scripts; /uploads sets its own CSP.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
    })
  );
  app.disable('x-powered-by');
}

/** CORS: explicit allow-list coming from CORS_ORIGINS in .env. */
function applyCors() {
  const allowList = [...env.server.corsOrigins];
  if (!env.isProd) {
    allowList.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      `http://127.0.0.1:${env.server.port}`
    );
  }

  app.use(
    cors({
      origin(origin, callback) {
        // Requests without Origin (curl, Telegram, images) are always allowed.
        if (!origin) return callback(null, true);
        if (allowList.includes(origin)) return callback(null, true);
        logger.warn(`Blocked CORS origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    })
  );
}

function applyParsers() {
  // Phone-friendly limits: images arrive through multipart, never as JSON.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  // Ngôn ngữ người dùng (Accept-Language → user.locale → mặc định 'vi').
  app.use(localeMiddleware);
  app.use(
    morgan(env.isProd ? 'tiny' : 'dev', {
      skip: (req) => req.path.startsWith(urls.prefix.admin), // AdminJS bundles are noisy
      stream: { write: (message) => logger.debug(message.trim()) },
    })
  );
  app.use(
    rateLimit({
      windowMs: env.rateLimit.windowMs,
      max: env.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      // Static images are already immutable and cacheable — do not rate limit them.
      skip: (req) => req.path.startsWith(urls.prefix.uploads) || req.path.startsWith(`${urls.prefix.api}/health`),
      message: {
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests, please try again later.',
      },
    })
  );
}

/* -------------------------------------------------------------------------- */
/*                          2. Static + API + Admin                           */
/* -------------------------------------------------------------------------- */

async function mountRoutes() {
  // --- uploaded photos (hardened, see middleware/static.middleware.js) -----
  app.use(urls.prefix.uploads, createUploadsRouter());

  // --- tiny landing page so the tunnel root is not a 404 -------------------
  app.get('/', (_req, res) => {
    res.type('html').send(
      `<!doctype html><meta charset="utf-8"><title>PixGram API</title>
       <style>body{font-family:system-ui;background:#fafafa;color:#262626;padding:40px;line-height:1.6}
       code{background:#efefef;padding:2px 6px;border-radius:6px}</style>
       <h1>📷 PixGram API</h1>
       <p>Status: <b>online</b></p>
       <ul>
         <li>Health: <code>${urls.api.health}</code></li>
         <li>Admin dashboard: <code>${urls.admin.dashboard}</code></li>
         <li>Feed endpoint: <code>${urls.api.posts.list}</code></li>
       </ul>`
    );
  });

  // --- JSON API ------------------------------------------------------------
  app.use(urls.prefix.api, apiRoutes);

  // --- 404 + error envelope ------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);
}

/* -------------------------------------------------------------------------- */
/*                              3. Bootstrap                                  */
/* -------------------------------------------------------------------------- */

async function start() {
  try {
    assertProductionSecrets();


    logger.banner([
      `PixGram API  ·  env=${env.nodeEnv}`,
      `public  ${urls.base}`,
      `local   http://127.0.0.1:${env.server.port}`,
      `uploads ${urls.uploads.base}`,
      `ngôn ngữ vi · en · zh  (mặc định: ${env.telegram.defaultLocale})`,
      `admin   ${urls.admin.dashboard}`,
    ]);

    // Storage first: multer needs the directories to exist.
    await ensureUploadFolders();

    // Database + schema. `alter` is convenient on a single-device deployment;
    // switch DB_SYNC to "none" and use migrations once the schema is frozen.
    await connectWithRetry();
    const syncMode = process.env.DB_SYNC === 'force' ? { force: true } : { alter: process.env.DB_SYNC !== 'none' };
    await sequelize.sync(syncMode);
    logger.success(`Schema synchronised (${Object.keys(sequelize.models).join(', ')})`);

    // HTTP stack
    applySecurityHeaders();
    applyCors();

    /**
     * ⚠️ THỨ TỰ QUAN TRỌNG: AdminJS phải được mount TRƯỚC express.json().
     * @adminjs/express đọc body theo cách riêng; nếu bộ đọc body chung đã tiêu
     * thụ request trước thì POST /admin/login ném WrongArgumentError (HTTP 500)
     * — lỗi rất khó đoán vì trang đăng nhập vẫn hiện bình thường.
     */
    app.use(urls.prefix.admin, await buildAdminRouter(app));

    applyParsers();
    await mountRoutes();

    httpServer = http.createServer(app);
    // Big photos over a phone hotspot: allow slow clients, kill dead sockets.
    httpServer.keepAliveTimeout = 65_000;
    httpServer.headersTimeout = 70_000;
    /**
     * ⚠️ SSE CHAT (/api/chat/stream) giữ một request MỞ LIÊN TỤC hàng giờ.
     * Node ≥18 mặc định `requestTimeout = 300s` → sẽ tự cắt luồng realtime
     * giữa chừng. Đặt 0 = tắt hẳn; keepAliveTimeout/headersTimeout vẫn dọn
     * các socket chết nên không có nguy cơ treo kết nối.
     */
    httpServer.requestTimeout = 0;

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(env.server.port, env.server.host, resolve);
    });

    const stats = await storage.getStorageStats();
    logger.success(
      `HTTP server listening on ${env.server.host}:${env.server.port} — ` +
        `${stats.files} image(s) stored (${stats.megabytes} MB)`
    );

    // Telegram bot: same process, non-blocking, failure is never fatal.
    if (env.telegram.enabled) {
      telegram
        .startTelegramBot()
        .then((bot) => {
          if (bot) logger.success('Telegram notifications active.');
        })
        .catch((error) => logger.warn(`Telegram init error: ${error.message}`));
    }

    if (env.cloudflare.hostname) {
      logger.info(
        `Cloudflare Tunnel target: ${env.cloudflare.hostname} → http://127.0.0.1:${env.server.port}`
      );
    }
  } catch (error) {
    logger.error(`Fatal startup error: ${error.message}`);
    logger.debug(error.stack);
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/*                          4. Graceful shutdown                              */
/* -------------------------------------------------------------------------- */

async function shutdown(signal) {
  logger.warn(`${signal} received — shutting down gracefully…`);
  telegram.stopTelegramBot();

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
    logger.info('HTTP server closed.');
  }
  try {
    await sequelize.close();
    logger.info('Database connection closed.');
  } catch (error) {
    logger.warn(`Sequelize close warning: ${error.message}`);
  }
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : reason}`);
});
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  logger.debug(error.stack || '');
});

if (require.main === module) start();

module.exports = { app, start };
