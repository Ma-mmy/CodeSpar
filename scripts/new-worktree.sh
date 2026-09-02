#!/usr/bin/env bash
# 为并行 Grok 窗口创建隔离 worktree：独立目录、分支、端口、SQLite。
# 用法：./scripts/new-worktree.sh <切片名>
# 兼容 macOS bash 3.2。

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

slug="${1:-}"
if [[ -z "$slug" ]]; then
  die "用法：./scripts/new-worktree.sh <切片名>   例：exam / grading / articles"
fi
if ! printf '%s' "$slug" | grep -Eq '^[a-zA-Z][a-zA-Z0-9-]{0,40}$'; then
  die "切片名只能是字母开头的字母/数字/连字符，例如 exam、grading"
fi

command -v git >/dev/null || die "需要 git"
if ! git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "当前目录还不是 git 仓库。先在项目根执行：git init && git add . && git commit -m 'baseline'"
fi
if ! git -C "$PROJECT_ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
  die "仓库还没有任何 commit。先 git add . && git commit -m 'baseline'"
fi

parent="$(cd "$PROJECT_ROOT/.." && pwd)"
target="$parent/CodeSpar-$slug"
branch="feat/$slug"

if [[ -e "$target" ]]; then
  die "目标目录已存在：$target"
fi
if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
  die "分支已存在：$branch  换个切片名，或先 git branch -D $branch"
fi

# 从已有 worktree 的 .env.local 收集占用端口，避开 8099/5173。
used_app=" 8099 "
used_vite=" 5173 "
# bash 3.2：不用 mapfile
while IFS= read -r wt; do
  [[ -z "$wt" ]] && continue
  envf="$wt/.env.local"
  [[ -f "$envf" ]] || continue
  p="$(grep -E '^CODESPAR_PORT=' "$envf" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' || true)"
  v="$(grep -E '^CODESPAR_VITE_PORT=' "$envf" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' || true)"
  [[ -n "$p" ]] && used_app="$used_app$p "
  [[ -n "$v" ]] && used_vite="$used_vite$v "
done <<EOF
$(git -C "$PROJECT_ROOT" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
EOF

pick_free() {
  local start="$1" used="$2" n cand
  n="$start"
  while [ "$n" -lt $((start + 80)) ]; do
    cand="$n"
    case "$used" in
      *" $cand "*) n=$((n + 1)); continue ;;
    esac
    if command -v lsof >/dev/null 2>&1; then
      if lsof -nP -iTCP:"$cand" -sTCP:LISTEN >/dev/null 2>&1; then
        n=$((n + 1))
        continue
      fi
    fi
    printf '%s' "$cand"
    return 0
  done
  return 1
}

APP_PORT_NEW="$(pick_free 8100 "$used_app")" || die "找不到空闲后端端口"
VITE_PORT_NEW="$(pick_free 5174 "$used_vite")" || die "找不到空闲 Vite 端口"
DB_NEW="$HOME/.codespar/worktrees/$slug.db"

info "创建 worktree $target （分支 $branch）…"
git -C "$PROJECT_ROOT" worktree add -b "$branch" "$target"

# 被 gitignore 的本地文件不会进 worktree，手动带过去再改端口/库路径。
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  cp "$PROJECT_ROOT/.env.local" "$target/.env.local"
else
  if [[ -f "$PROJECT_ROOT/.env.local.example" ]]; then
    cp "$PROJECT_ROOT/.env.local.example" "$target/.env.local"
  else
    : > "$target/.env.local"
  fi
fi

upsert_env() {
  local file="$1" key="$2" val="$3"
  if grep -Eq "^#?${key}=" "$file" 2>/dev/null; then
    # bash 3.2 无 sed -i 可移植保证，用临时文件
    awk -v k="$key" -v v="$val" '
      BEGIN { done=0 }
      $0 ~ "^#?" k "=" {
        if (!done) { print k "=" v; done=1 }
        next
      }
      { print }
      END { if (!done) print k "=" v }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
  fi
}

upsert_env "$target/.env.local" CODESPAR_PORT "$APP_PORT_NEW"
upsert_env "$target/.env.local" CODESPAR_VITE_PORT "$VITE_PORT_NEW"
upsert_env "$target/.env.local" CODESPAR_DB_PATH "$DB_NEW"
mkdir -p "$(dirname "$DB_NEW")"

ok "worktree 已就绪"
printf '\n'
printf '目录    %s\n' "$target"
printf '分支    %s\n' "$branch"
printf '后端    http://localhost:%s\n' "$APP_PORT_NEW"
printf '前端    http://localhost:%s\n' "$VITE_PORT_NEW"
printf '数据库  %s\n' "$DB_NEW"
printf '\n'
printf '第二个窗口：\n'
printf '  cd %s && grok\n' "$target"
printf '  ./scripts/dev.sh\n'
printf '\n'
printf '第一句话建议写清：切片=%s；禁止改 App.tsx / AppLayout.tsx / api/client.ts / application.yml / 公共 ui / 已有实体字段。\n' "$slug"
printf '合入：在主仓库 git merge %s （只在一个窗口解冲突）\n' "$branch"
printf '清理：git -C %s worktree remove %s && git -C %s branch -d %s\n' "$PROJECT_ROOT" "$target" "$PROJECT_ROOT" "$branch"
