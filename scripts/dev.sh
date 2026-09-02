#!/usr/bin/env bash
# 开发模式：后端(CODESPAR_PORT, 热重启) + 前端(CODESPAR_VITE_PORT, HMR, 代理 /api → 后端)

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# SQLite 由应用自动建库，无需启动数据库服务
mkdir -p "$(dirname "$DB_PATH")"

cleanup() {
  info "停止服务…"
  [[ -n "${BACK_PID:-}" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

info "启动后端（:${APP_PORT}）数据库 $DB_PATH …"
cd "$BACKEND_DIR"
mvn -B spring-boot:run &
BACK_PID=$!

if ! wait_for_health; then
  die "后端启动失败"
fi

info "启动前端（:${VITE_PORT}，代理 /api → :${APP_PORT}）…"
cd "$FRONTEND_DIR"
[[ -d node_modules ]] || pnpm install
# 把端口交给 vite.config.ts（process.env），并显式传 --port 防止被占用时静默 +1
CODESPAR_PORT="$APP_PORT" CODESPAR_VITE_PORT="$VITE_PORT" pnpm dev -- --port "$VITE_PORT" --strictPort &
FRONT_PID=$!

sleep 2
command -v open >/dev/null && open "http://localhost:${VITE_PORT}"

info "前端 http://localhost:${VITE_PORT} ｜ 后端 http://localhost:${APP_PORT}"
info "按 Ctrl+C 停止全部"
wait
