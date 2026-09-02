# CodeSpar — Agent 约定

本地单人 LLM 模考：出题 → 整卷作答 → 对照 rubric 阅卷 → 弱项追踪。无登录、无账号。
产品决策与术语以 `docs/PRD.md` 为准；怎么做以 `docs/TECH_DESIGN.md` 为准。不要把那两份文档整页贴进会话。

Grok 每次启动都会读本文件。只写**代码里看不出来、且会反复踩**的事实。第二次纠正同一件事，把结论追到这里，不要只口头说一次。

## 锁死的产品边界（未经用户明确要求不要改）

- 本地单人，数据在本机 SQLite，不上账号体系
- 题型：问答 / 系统设计 / 选择判断 / 填空；**不做**代码题和沙箱
- 仅整卷模考，不做成刷单题
- 不要引入 Spring AI Graph / 多智能体编排，除非用户明确要做陪审团阅卷

## 命令

```bash
./scripts/dev.sh          # 前端 HMR + 后端热重启
./scripts/build.sh        # 前端产物打进 jar
./scripts/start.sh        # 生产 jar
./scripts/new-worktree.sh <切片名>   # 另开隔离窗口
```

默认：后端 `8099`，Vite `5173`，库 `~/.codespar/codespar.db`。可用 `.env.local` 覆盖 `CODESPAR_PORT` / `CODESPAR_VITE_PORT` / `CODESPAR_DB_PATH`。

验证（改完代码必须跑，对应 `/verify`）：

```bash
pnpm -C frontend lint
pnpm -C frontend exec tsc -b --pretty false
mvn -f backend/pom.xml -q test
```

前端 UI 改动还要在浏览器里点一遍相关路由，不要只看编译绿。开发时打开 `http://localhost:$CODESPAR_VITE_PORT`（默认 5173），不要打开 8099 上的旧静态包。

## 代码里看不出来的坑

- **SQLite 连接池必须为 1**（`application.yml` hikari）。出题/阅卷并发写库，池 > 1 会 `SQLITE_BUSY`，表现为「确认组卷」失败。
- **多窗口默认会抢同一份库和同一端口。** 第二个会话必须用 `./scripts/new-worktree.sh`，换端口 + 换 `CODESPAR_DB_PATH`。禁止两个进程写 `~/.codespar/codespar.db`。
- `application.yml` 里的 `spring.ai.openai` / `dashscope` 是启动哑值。真模型在库里，由 `ChatModelFactory` 运行时创建。
- apiKey 经 AES-256-GCM 入库，主密钥 `~/.codespar/master.key`。日志、异常、SSE 事件里禁止出现 key 明文。
- 出题/阅卷进度是 **SSE**（`EventSource` GET）。Vite 代理 `/api` 的 timeout 必须为 0，否则长任务被掐断。
- Prompt 模板在 `backend/src/main/resources/prompts/*.st`，不要把长模板内嵌进 Java。
- Flyway 脚本序号独占：先看 `backend/src/main/resources/db/migration/` 最大号，下一个窗口用 N+1，禁止两人各写一个 `V8`。
- 业务错误 `throw new BizException("...")`，响应 `{"message":"..."}`；前端只展示 `message`。
- 测试放 `backend/src/test`，不要放 `main`。前端测试目前几乎没有，别假装有覆盖。
- `backend/src/main/resources/static/` 由 `build.sh` 注入，不要手改。
- 脚本必须兼容 **macOS bash 3.2**（禁止 `mapfile`、关联数组）。
- `frontend/src/api/client.ts` 的 `/api` 前缀不要改；代理目标跟 `CODESPAR_PORT` 走，不是 8080。

## 并行切片（一窗一路，禁止跨切片改文件）

| 切片 | 可改 | 不要动 |
|---|---|---|
| generate | `Generation*`、`generate/` 页、`api/generation.ts`、`prompts/{generate,optimize,regenerate,fix}.st` | 阅卷、答题控件 |
| exam | `Exam*`、`exams/`（作答/列表）、`api/exams.ts` | 出题流水线、阅卷算法 |
| grading | `Grading*`、`LocalScorer`、`ReportPage`、`api/gradings.ts`、`prompts/grade*.st` | 出题、文章 |
| articles | `Article*`、`articles/`、`api/articles.ts`、`article_refine.st` | 组卷核心 |
| settings | 模型/分类/系统提示词、`ModelsPage`、`settings/` | `ChatModelFactory` 的协议抽象 |
| dashboard | `Dashboard*`、弱项统计、错题入口 | 出题/阅卷主路径 |

**独占文件**（任何并行窗口要改，先停下来对齐，不要两边一起写）：`App.tsx`、`AppLayout.tsx`、`api/client.ts`、`application.yml`、Flyway 下一号、`components/ui/*`、实体/枚举的已有字段。公共类型只增不改字段名。

一个会话只做一件切片。上下文脏了用 `/new`，不要在同一窗口里串无关需求。

## 工作流

- 改 schema、公共组件、跨切片、不可逆行为：先 `/plan`，对齐再写代码。
- 改文案、单页小修：直接做。
- 复杂实现用聪明模型；批量改注释/文案可以用小模型。纠正你时间的成本远高于 token。
- 写完先 `/verify`，再交给用户。前端改动还要在浏览器走通：点、填、提交、看相关路由有没有回归。
- 子代理只外包只读探索、跑测试、审查 diff；真正改代码的窗口要有明确切片所有权。
