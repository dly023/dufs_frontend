#!/bin/bash
# 本机开发用：在 5001 启动 dufs（避开 macOS AirPlay 占用的 5000）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="${DUFS_DATA:-$ROOT/dev-data}"
PORT="${1:-5001}"
ASSETS="${DUFS_ASSETS:-}"

mkdir -p "$DATA"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用；若是旧 dufs，先: pkill -f 'dufs .*--port $PORT'"
fi

echo "启动 dufs"
echo "  目录: $DATA"
echo "  端口: $PORT"
echo "  联调: npm run dev  →  http://127.0.0.1:5173  (proxy → :$PORT)"

ARGS=( "$DATA" --port "$PORT" --allow-all --allow-search )
if [[ -n "$ASSETS" ]]; then
  ARGS+=( --assets "$ASSETS" )
  echo "  assets: $ASSETS"
fi

exec dufs "${ARGS[@]}"
