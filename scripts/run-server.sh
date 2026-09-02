#!/usr/bin/env bash
# CodeSpar 服务器启动脚本（适合 systemd / nohup / 直接前台跑）
#
# 用法：
#   1. 把 codespar.jar 放到本脚本同级，或设置 CODESPAR_JAR
#   2. （可选）复制 env 示例后改路径：
#        cp .env.server.example /var/lib/codespar/.env
#        export $(grep -v '^#' /var/lib/codespar/.env | xargs)
#   3. 启动：
#        ./scripts/run-server.sh
#
# 常用环境变量：
#   CODESPAR_JAR              jar 路径（默认：脚本旁或 ../backend/target/codespar.jar）
#   CODESPAR_PORT             端口，默认 8099
#   CODESPAR_BIND             监听地址，默认 127.0.0.1（公网请反代，勿改成 0.0.0.0 除非已鉴权）
#   CODESPAR_DB_PATH          SQLite 路径，默认 /var/lib/codespar/codespar.db
#   CODESPAR_MASTER_KEY_FILE  主密钥文件，默认与 DB 同目录 master.key
#   CODESPAR_MASTER_KEY       可选；若设置则优先于文件（Base64 的 32 字节）
#   CODESPAR_ACCESS_PASSWORD  默认访问口令（至少 8 位）；设置页可改
#   CODESPAR_JAVA_OPTS        额外 JVM 参数，如 -Xms256m -Xmx1g

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 解析 jar：优先环境变量 → 脚本同级 → 仓库构建产物
if [[ -z "${CODESPAR_JAR:-}" ]]; then
  if [[ -f "$SCRIPT_DIR/codespar.jar" ]]; then
    CODESPAR_JAR="$SCRIPT_DIR/codespar.jar"
  elif [[ -f "$SCRIPT_DIR/../backend/target/codespar.jar" ]]; then
    CODESPAR_JAR="$SCRIPT_DIR/../backend/target/codespar.jar"
  else
    echo "✗ 找不到 codespar.jar。请先 ./scripts/build.sh，或设置 CODESPAR_JAR=/path/to/codespar.jar" >&2
    exit 1
  fi
fi
CODESPAR_JAR="$(cd "$(dirname "$CODESPAR_JAR")" && pwd)/$(basename "$CODESPAR_JAR")"
[[ -f "$CODESPAR_JAR" ]] || { echo "✗ jar 不存在：$CODESPAR_JAR" >&2; exit 1; }

command -v java >/dev/null || { echo "✗ 未找到 java，请安装 JDK 21+" >&2; exit 1; }

CODESPAR_PORT="${CODESPAR_PORT:-8099}"
CODESPAR_BIND="${CODESPAR_BIND:-127.0.0.1}"
CODESPAR_DB_PATH="${CODESPAR_DB_PATH:-/var/lib/codespar/codespar.db}"
CODESPAR_MASTER_KEY_FILE="${CODESPAR_MASTER_KEY_FILE:-$(dirname "$CODESPAR_DB_PATH")/master.key}"
CODESPAR_ACCESS_HASH_FILE="${CODESPAR_ACCESS_HASH_FILE:-$(dirname "$CODESPAR_DB_PATH")/access.hash}"
CODESPAR_JAVA_OPTS="${CODESPAR_JAVA_OPTS:-}"

mkdir -p "$(dirname "$CODESPAR_DB_PATH")"
mkdir -p "$(dirname "$CODESPAR_MASTER_KEY_FILE")"
mkdir -p "$(dirname "$CODESPAR_ACCESS_HASH_FILE")"

echo "==> CodeSpar"
echo "    jar:        $CODESPAR_JAR"
echo "    bind:       $CODESPAR_BIND:$CODESPAR_PORT"
echo "    db:         $CODESPAR_DB_PATH"
echo "    master-key: ${CODESPAR_MASTER_KEY:+(环境变量 CODESPAR_MASTER_KEY)}${CODESPAR_MASTER_KEY:-$CODESPAR_MASTER_KEY_FILE}"
echo "    access-hash:${CODESPAR_ACCESS_HASH_FILE}"
echo "    health:     http://${CODESPAR_BIND}:$CODESPAR_PORT/api/health"

# 前台 exec，便于 systemd 接管进程；Ctrl+C / systemctl stop 可正常结束
# shellcheck disable=SC2086
exec java $CODESPAR_JAVA_OPTS -jar "$CODESPAR_JAR" \
  --server.address="$CODESPAR_BIND" \
  --server.port="$CODESPAR_PORT" \
  --spring.datasource.url="jdbc:sqlite:${CODESPAR_DB_PATH}?journal_mode=WAL&busy_timeout=30000&foreign_keys=on" \
  --codespar.crypto.master-key-file="$CODESPAR_MASTER_KEY_FILE" \
  --codespar.access.hash-file="$CODESPAR_ACCESS_HASH_FILE"
