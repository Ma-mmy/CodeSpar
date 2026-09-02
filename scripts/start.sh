#!/usr/bin/env bash
# 一键启动（生产模式）：SQLite 由应用自动建库 → 启动 jar → 打开浏览器

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# SQLite 文件不会自动创建父目录，先确保 ~/.codespar 存在
mkdir -p "$(dirname "$DB_PATH")"

if [[ ! -f "$JAR_PATH" ]]; then
  warn "未找到 jar，先执行构建…"
  "$PROJECT_ROOT/scripts/build.sh"
fi

if lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "端口 $APP_PORT 已被占用。可设置 CODESPAR_PORT 换端口，或先停掉占用进程。"
fi

info "启动 CodeSpar（数据库：$DB_PATH）…"
java -jar "$JAR_PATH" \
  --server.port="$APP_PORT" \
  --spring.datasource.url="jdbc:sqlite:$DB_PATH?journal_mode=WAL&busy_timeout=5000&foreign_keys=on" &

APP_PID=$!
trap 'kill $APP_PID 2>/dev/null || true' EXIT INT TERM

if wait_for_health; then
  command -v open >/dev/null && open "http://localhost:$APP_PORT"
else
  die "服务启动超时，请查看上方日志"
fi

info "按 Ctrl+C 停止服务"
wait $APP_PID
