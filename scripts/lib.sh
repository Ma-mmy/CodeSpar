#!/usr/bin/env bash
# CodeSpar 脚本公共函数

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
JAR_PATH="$BACKEND_DIR/target/codespar.jar"

APP_PORT="${CODESPAR_PORT:-8099}"
VITE_PORT="${CODESPAR_VITE_PORT:-5173}"

# 本地环境变量文件（存端口等，已被 .gitignore 忽略）
ENV_FILE="$PROJECT_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  APP_PORT="${CODESPAR_PORT:-8099}"
  VITE_PORT="${CODESPAR_VITE_PORT:-5173}"
fi

# SQLite 数据库文件 —— 应用启动时自动创建，无需手动建库
# 并行 worktree 必须换 CODESPAR_DB_PATH，禁止多进程写默认库
DB_PATH="${CODESPAR_DB_PATH:-$HOME/.codespar/codespar.db}"

info()  { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[0;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33m!\033[0m %s\n' "$*"; }
die()   { printf '\033[0;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

wait_for_health() {
  local url="http://localhost:$APP_PORT/api/health"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "服务就绪：http://localhost:$APP_PORT"
      return 0
    fi
    sleep 1
  done
  return 1
}
