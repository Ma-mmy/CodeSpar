#!/usr/bin/env bash
# 生产构建：前端产物打进后端 jar，最终产出单个可执行 jar

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

STATIC_DIR="$BACKEND_DIR/src/main/resources/static"

info "构建前端…"
cd "$FRONTEND_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build

info "将前端产物拷入后端 static/…"
rm -rf "${STATIC_DIR:?}"/*
mkdir -p "$STATIC_DIR"
cp -R "$FRONTEND_DIR/dist/." "$STATIC_DIR/"

info "打包后端…"
cd "$BACKEND_DIR"
mvn -B -q clean package -DskipTests

[[ -f "$JAR_PATH" ]] || die "构建失败：未生成 $JAR_PATH"
ok "构建完成：$JAR_PATH ($(du -h "$JAR_PATH" | cut -f1))"
