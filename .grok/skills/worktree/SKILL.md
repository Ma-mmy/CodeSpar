---
name: worktree
description: 为并行 Grok 窗口创建隔离 git worktree（独立目录、分支、端口、SQLite）。用户要另开窗口、并行切片、或说 /worktree 时使用。
argument-hint: 切片名
---

# /worktree

两个 Grok 窗口禁止写同一份工作树。本命令创建隔离副本。

## 步骤

1. 向用户确认切片名（如 `exam`、`grading`、`articles`）。不要用 `frontend` / `backend` 这种横切名。
2. 在**当前主仓库根**执行：

```bash
./scripts/new-worktree.sh <切片名>
```

3. 把脚本打印的「新目录、分支、端口、启动命令、独占文件」原样告诉用户。
4. 提醒：第二个 Grok 窗口必须 `cd` 到新目录再开；第一句话写明切片和禁止改的共享文件（见 `AGENTS.md`）。
5. 不要在当前窗口切到新 worktree 里继续改主目录的文件。

若仓库还不是 git 仓库，先说明需要 `git init` + 至少一次 commit，再跑脚本。
