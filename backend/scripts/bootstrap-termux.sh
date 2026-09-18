#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/bootstrap-termux.sh — prepares a fresh Termux install so that
#  `npm start` works immediately.
#     bash scripts/bootstrap-termux.sh
#  Installs: Node.js LTS, MariaDB, cloudflared, git, curl, openssl, build tools
#  (bcrypt/sharp-style native modules need clang + make on ARM64).
# ============================================================================
set -euo pipefail

if [ -z "${TERMUX_VERSION:-}" ] && [ ! -d /data/data/com.termux ]; then
  echo "This script is meant to run inside Termux on the Android device." >&2
fi

echo "[BOOTSTRAP] Updating packages…"
pkg update -y && pkg upgrade -y

echo "[BOOTSTRAP] Installing system packages…"
pkg install -y nodejs-lts mariadb cloudflared git curl wget openssl \
  python clang make binutils libffi openssl-tool termux-api

echo "[BOOTSTRAP] Enabling storage access (for photo backups)…"
termux-setup-storage || true

echo "[BOOTSTRAP] Starting MariaDB once so the data directory is initialised…"
mkdir -p "$PREFIX/var/lib/mysql"
if [ ! -d "$PREFIX/var/lib/mysql/mysql" ]; then
  mariadb-install-db --auth-root-authentication-method=normal --datadir="$PREFIX/var/lib/mysql"
fi

echo "[BOOTSTRAP] Extending the inotify limit (Sequelize/Meta watch friendly)…"
echo "fs.inotify.max_user_watches=524288" > "$PREFIX/etc/sysctl.conf" || true

cat <<'EOT'

[BOOTSTRAP] Done. Next steps:
  cd backend
  cp .env.example .env && nano .env          # <-- all secrets live here
  npm install
  npm run db:init                            # create DB + app user
  npm run tunnel:install                     # Cloudflare login + fixed domain
  npm start                                  # DB + API + tunnel in one shot

Tip: keep the phone charging and run `termux-wake-lock` before `npm start`.
EOT
