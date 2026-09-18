#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  scripts/start-tunnel.sh — runs the Cloudflare Tunnel in the foreground.
#  `cloudflared tunnel run` reads ~/.cloudflared/config.yml, which maps
#  api.d4mdev.click → http://127.0.0.1:$PORT. We only pass a *name* from .env,
#  never a hardcoded URL.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
TERMUX_PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PORT="${PORT:-4000}"
TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-familygram-api}"
# Token của tunnel do Cloudflare dashboard tạo (Zero Trust → Networks → Tunnels).
# Khi có token thì KHÔNG cần config.yml: tuyến đường (public hostname → origin)
# đã được cấu hình trên dashboard.
TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
HOSTNAME="${CLOUDFLARE_HOSTNAME:-api.d4mdev.click}"
CONFIG_FILE="${CLOUDFLARE_TUNNEL_CONFIG:-$HOME/.cloudflared/config.yml}"

# ---- locate the cloudflared binary -----------------------------------------
if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED="$(command -v cloudflared)"
elif [ -x "$TERMUX_PREFIX/bin/cloudflared" ]; then
  CLOUDFLARED="$TERMUX_PREFIX/bin/cloudflared"
elif [ -x "$HOME/cloudflared" ]; then
  CLOUDFLARED="$HOME/cloudflared"
else
  echo "[TUNNEL] cloudflared not found. Install it first:" >&2
  echo "         bash scripts/setup-cloudflared.sh" >&2
  echo "         (or: pkg install cloudflared)" >&2
  # Keep the process alive so concurrently does not kill the other two services.
  echo "[TUNNEL] Idling… the API is still reachable on the LAN at http://<phone-ip>:$PORT"
  while true; do sleep 3600; done
fi

# ---- wait for the API to answer before starting the tunnel ------------------
echo "[TUNNEL] Waiting for the API on http://127.0.0.1:$PORT …"
for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "[TUNNEL] API is up."
    break
  fi
  sleep 3
done

if [ -n "$TUNNEL_TOKEN" ]; then
  # Cách 1 (khuyên dùng): tunnel quản lý qua dashboard, xác thực bằng token.
  echo "[TUNNEL] Starting token-managed tunnel  ($HOSTNAME → http://127.0.0.1:$PORT)"
  exec "$CLOUDFLARED" tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
elif [ -f "$CONFIG_FILE" ]; then
  echo "[TUNNEL] Starting tunnel '$TUNNEL_NAME'  ($HOSTNAME → http://127.0.0.1:$PORT)"
  exec "$CLOUDFLARED" --config "$CONFIG_FILE" tunnel run "$TUNNEL_NAME"
else
  echo "[TUNNEL] Không có CLOUDFLARE_TUNNEL_TOKEN và cũng không thấy $CONFIG_FILE"
  echo "[TUNNEL] → tạm dùng quick tunnel (URL đổi mỗi lần chạy)."
  echo "[TUNNEL] Muốn domain cố định: đặt CLOUDFLARE_TUNNEL_TOKEN trong .env"
  exec "$CLOUDFLARED" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate
fi
