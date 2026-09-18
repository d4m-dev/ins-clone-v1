#!/usr/bin/env node
'use strict';

/**
 * scripts/doctor.js — "khám sức khoẻ" máy chủ PixGram, chạy trên điện thoại.
 * ---------------------------------------------------------------------------
 *   cd backend && npm run doctor
 *
 * Vì sao cần? Máy chủ là chiếc điện thoại trong nhà, không có ai ngồi cạnh.
 * Lệnh này trả lời trong 5 giây những câu hỏi hay gặp nhất:
 *   • .env đã điền đủ khoá chưa (in TÊN khoá thiếu, KHÔNG in giá trị)?
 *   • thư mục uploads có tồn tại, chiếm bao nhiêu, còn trống bao nhiêu?
 *   • MariaDB có đang chạy, và app có kết nối được không?
 *   • cổng 3306/4000 có bị tiến trình cũ chiếm không?
 *   • điện thoại có đang cạn pin/đầy đĩa không (nguyên nhân số 1 khiến server chết)?
 *
 * Script CHỈ ĐỌC: không sửa gì, không gửi gì, không cần thư viện ngoài.
 * ---------------------------------------------------------------------------
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execSync } = require('node:child_process');

const BACKEND = path.join(__dirname, '..');
let problems = 0;
let warnings = 0;

const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => {
  warnings += 1;
  console.log(`  ⚠️  ${m}`);
};
const bad = (m) => {
  problems += 1;
  console.log(`  ❌ ${m}`);
};
const head = (m) => console.log(`\n── ${m} ${'─'.repeat(Math.max(2, 58 - m.length))}`);

/** Đọc .env thành map tên → giá trị (không in giá trị ra ngoài). */
function readEnvFile() {
  const file = path.join(BACKEND, '.env');
  if (!fs.existsSync(file)) return null;
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) map[match[1]] = match[2];
  }
  return map;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const gb = (bytes) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;

async function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(false); // có ai đó đang nghe
    });
    socket.on('error', () => resolve(true));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(true);
    });
  });
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes, missing: true };
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== '.gitkeep') {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* bỏ qua tệp vừa bị xoá */
        }
      }
    }
  };
  walk(dir);
  return { files, bytes, missing: false };
}

/** Dung lượng trống của phân vùng chứa máy chủ (Android/Termux/Linux). */
function diskFree() {
  try {
    const out = execSync(`df -k "${BACKEND}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = out.trim().split('\n').pop().trim().split(/\s+/);
    const availableKb = Number.parseInt(line[3], 10);
    return Number.isFinite(availableKb) ? availableKb * 1024 : null;
  } catch {
    return null;
  }
}

function battery() {
  try {
    const level = fs.readFileSync('/sys/class/power_supply/battery/capacity', 'utf8').trim();
    const status = fs.existsSync('/sys/class/power_supply/battery/status')
      ? fs.readFileSync('/sys/class/power_supply/battery/status', 'utf8').trim()
      : '?';
    return { level: Number(level), status };
  } catch {
    return null;
  }
}

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   🩺  PixGram — khám sức khoẻ máy chủ                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  /* ------------------------------- môi trường ------------------------------ */
  head('Máy & phiên bản');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  console.log(`  Node ${process.versions.node} · ${process.platform}/${process.arch} · host ${os.hostname()}`);
  if (nodeMajor < 18) bad(`Node quá cũ (cần ≥ 18 để có fetch/FormData). Đang dùng ${process.versions.node}`);
  else ok('Phiên bản Node đạt yêu cầu (≥ 18)');

  if (os.totalmem() < 1.5 * 1024 ** 3) warn(`RAM hơi thấp: ${gb(os.totalmem())} — nên tắt bớt app khác khi chạy máy chủ`);
  else ok(`RAM ${gb(os.totalmem())}`);

  const bat = battery();
  if (bat) {
    const label = `Pin ${bat.level}% (${bat.status})`;
    if (bat.level < 20 && !/charg/i.test(bat.status)) warn(`${label} — cắm sạc để máy chủ không tắt giữa chừng`);
    else if (/charg/i.test(bat.status)) ok(`${label} — đang sạc, lý tưởng cho máy chủ chạy 24/7`);
    else console.log(`  ℹ️  ${label}`);
  }

  /* ---------------------------------- .env -------------------------------- */
  head('Tệp cấu hình backend/.env');
  const envMap = readEnvFile();
  if (!envMap) {
    bad('Chưa có backend/.env — chạy: cp .env.example .env rồi điền');
  } else {
    ok(`Đã có .env (${Object.keys(envMap).length} khoá)`);

    // Khoá bắt buộc phải có giá trị thật.
    const required = [
      'JWT_SECRET',
      'ADMIN_SESSION_SECRET',
      'DB_PASSWORD',
      'PUBLIC_BASE_URL',
      'FRONTEND_BASE_URL',
      'CORS_ORIGINS',
    ];
    const emptyRequired = required.filter((key) => !envMap[key] || envMap[key].length < 4);
    if (emptyRequired.length) bad(`Khoá bắt buộc còn trống: ${emptyRequired.join(', ')}`);
    else ok('Các khoá bắt buộc đã điền');

    // Cặp bật/tắt thường quên điền phần "phụ thuộc".
    const pairs = [
      ['TELEGRAM_ENABLED', ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID'], 'Telegram'],
      ['EMAIL_ENABLED', ['SENDER_EMAIL', 'SENDER_PASSWORD', 'NOTIFY_EMAIL'], 'Email'],
      ['AI_ENABLED', ['GEMINI_API_KEY'], 'Trợ lý AI'],
    ];
    for (const [flag, deps, label] of pairs) {
      const on = String(envMap[flag]).toLowerCase() === 'true';
      const missing = deps.filter((key) => !envMap[key]);
      if (on && missing.length) bad(`${label}: ${flag}=true nhưng thiếu ${missing.join(', ')}`);
      else if (on) ok(`${label}: đang bật và đã đủ khoá`);
      else console.log(`  ℹ️  ${label}: đang tắt (${flag}=false)`);
    }

    const isProd = envMap.NODE_ENV === 'production';
    for (const key of ['JWT_SECRET', 'ADMIN_SESSION_SECRET', 'DB_PASSWORD']) {
      const value = envMap[key] || '';
      if (value && value.length < 16 && isProd) bad(`${key} quá ngắn cho production (cần ≥ 32 ký tự ngẫu nhiên)`);
    }
    if (envMap.CLOUDFLARE_TUNNEL_TOKEN && envMap.PUBLIC_BASE_URL) ok('Đã có token tunnel + địa chỉ công khai');
    else warn('Thiếu CLOUDFLARE_TUNNEL_TOKEN hoặc PUBLIC_BASE_URL — web bên ngoài sẽ không vào được');

    try {
      const mode = (fs.statSync(path.join(BACKEND, '.env')).mode & 0o777).toString(8);
      if (mode === '600') ok('Quyền tệp .env = 600 (chỉ chủ sở hữu đọc được)');
      else warn(`Quyền .env = ${mode} — nên đặt: chmod 600 backend/.env`);
    } catch {
      /* bỏ qua */
    }
  }

  /* -------------------------------- thư mục ------------------------------- */
  head('Kho ảnh/video (uploads)');
  const uploadRoot = path.resolve(BACKEND, envMap?.UPLOAD_DIR || 'uploads');
  const stats = dirStats(uploadRoot);
  if (stats.missing) warn(`Chưa có ${uploadRoot} — sẽ được tạo ở lần khởi động đầu tiên`);
  else ok(`${stats.files} tệp · ${mb(stats.bytes)} trong ${uploadRoot}`);

  const free = diskFree();
  if (free !== null) {
    if (free < 500 * 1024 ** 2) bad(`Chỉ còn ${mb(free)} trống — dọn bớt ảnh hoặc thẻ nhớ trước khi chạy tiếp`);
    else if (free < 2 * 1024 ** 3) warn(`Còn ${gb(free)} trống — theo dõi thêm (album sẽ lớn dần)`);
    else ok(`Còn ${gb(free)} trống`);
  }

  /* ---------------------------------- cổng -------------------------------- */
  head('Cổng mạng');
  const dbPort = Number(envMap?.DB_PORT || 3306);
  const apiPort = Number(envMap?.PORT || 4000);
  const dbOpen = !(await portFree(dbPort));
  const apiOpen = !(await portFree(apiPort));

  if (dbOpen) ok(`MariaDB đang nghe ở cổng ${dbPort}`);
  // Chưa bật MariaDB là chuyện bình thường khi khám trước khi start:
  // `npm start` sẽ tự dựng nó lên. Chỉ nhắc, không tính là lỗi.
  else warn(`MariaDB chưa chạy (cổng ${dbPort} trống) — npm start sẽ tự bật; muốn bật riêng: npm run start:db`);

  if (apiOpen) ok(`API đang nghe ở cổng ${apiPort} (máy chủ đang chạy)`);
  else console.log(`  ℹ️  Cổng ${apiPort} trống: API chưa chạy — bình thường nếu bạn vừa khởi động máy`);

  /* -------------------------------- database ------------------------------ */
  head('Kết nối database');
  try {
    // eslint-disable-next-line global-require
    const { sequelize } = require(path.join(BACKEND, 'models'));
    await sequelize.authenticate();
    const [rows] = await sequelize.query('SELECT COUNT(*) AS n FROM users');
    ok(`Kết nối được MariaDB · có ${rows?.[0]?.n ?? '?'} thành viên`);
    const [posts] = await sequelize.query('SELECT COUNT(*) AS n FROM posts');
    console.log(`  ℹ️  ${posts?.[0]?.n ?? '?'} bài viết trong album`);
    await sequelize.close();
  } catch (error) {
    const message = String(error.message || error).slice(0, 110);
    if (/ECONNREFUSED|ENOTFOUND/.test(message)) warn(`Chưa kết nối được (MariaDB chưa chạy?) — ${message}`);
    else if (/Access denied/.test(message)) bad(`Sai tài khoản database — chạy: npm run db:init (${message})`);
    else bad(`Lỗi database: ${message}`);
  }

  /* ------------------------------ kết luận -------------------------------- */
  head('Kết quả');
  if (problems === 0 && warnings === 0) console.log('  🎉 Mọi thứ bình thường — cứ chạy: npm start');
  else if (problems === 0) console.log(`  👍 Chạy được, có ${warnings} điểm nên xem lại (⚠️ ở trên)`);
  else console.log(`  🛠  ${problems} lỗi cần sửa trước (❌ ở trên), ${warnings} cảnh báo`);
  console.log('');
  process.exit(problems === 0 ? 0 : 1);
})();
