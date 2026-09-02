# CodeSpar

面向 Agent 工程师的 LLM 驱动模考与复盘系统。

你写一段提示词描述想考什么，指定题型、数量、难度与知识点，由你选定的模型现场生成一整套试卷；
答完后由模型对照出题时同步产出的评分要点逐点打分、点评。题目与阅卷结果沉淀成你的能力画像，
告诉你下一轮该攻哪里。

- 产品需求：[docs/PRD.md](docs/PRD.md)
- 技术方案：[docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Java 21 · Spring Boot 3.5.4 · Spring AI 1.1.2 · Spring AI Alibaba 1.1.2.0 · MyBatis-Plus 3.5.12 · Flyway |
| 数据库 | SQLite 3.x（xerial JDBC，单文件 `~/.codespar/codespar.db`） |
| 前端 | React 19 · Vite 8 · TypeScript · Tailwind v4 · TanStack Query · Recharts |
| 打包 | 前端产物内嵌进 Spring Boot jar，单进程、同源、无跨域 |

模型接入统一走 **OpenAI 兼容协议**（baseURL + apiKey + model 名），代码里没有任何厂商判断，
因此 DeepSeek / Kimi / 智谱 / OpenRouter / 硅基流动 / 本地 Ollama / 公司内网网关都能直接接入。
通义千问额外支持 DashScope 原生接入。

## 首次运行

**前置**：JDK 21、Maven 3.6+、Node 20+、pnpm。无需安装数据库 —— SQLite 单文件，由应用首次启动自动建库。

```bash
# 1.（可选）复制本地配置
cp .env.local.example .env.local

# 2. 一键启动（构建 → 启动 → 开浏览器）
./scripts/start.sh
```

首次运行会自动构建前端与后端，耗时稍长。之后启动只需几秒。

数据库文件位于 `~/.codespar/codespar.db`（可用 `CODESPAR_DB_PATH` 改位置），表结构由 Flyway 自动迁移。

服务地址 http://localhost:8099

## 日常开发

```bash
./scripts/dev.sh     # 前端 5173 (HMR) + 后端 8099 (热重启)，前端代理 /api → 8099
./scripts/build.sh   # 仅生产构建，产出 backend/target/codespar.jar
```

## 脚本说明

| 脚本 | 用途 |
|------|------|
| `scripts/start.sh` | 生产模式一键启动：构建（如需）→ 启动 → 开浏览器（SQLite 自动建库） |
| `scripts/dev.sh` | 开发模式：前后端分离热更新 |
| `scripts/build.sh` | 生产构建：前端 build → 拷入 static → mvn package |
| `scripts/lib.sh` | 公共函数（被上面三个 source，不单独执行） |

数据库表结构由 **Flyway** 在应用启动时自动迁移，无需手动建表。

## 配置

所有本地配置走 `.env.local`（已被 gitignore）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CODESPAR_PORT` | `8099` | 应用端口 |
| `CODESPAR_DB_PATH` | `~/.codespar/codespar.db` | SQLite 数据库文件路径（首次启动自动创建） |

各家模型的 apiKey 不走配置文件，而是在应用内「模型管理」页录入，
以 **AES-256-GCM 加密**存库，主密钥位于 `~/.codespar/master.key`（首次启动自动生成，权限 600）。

## 实施进度

- [x] **P1 地基** — Maven 骨架、Flyway schema、前端脚手架、三个脚本
- [x] **P2 模型管理** — 动态模型工厂、加密存储、连通测试
- [x] **P3 出题** — Prompt 模板、分批并发、宽松解析、SSE 进度、预览页
- [x] **P4 答题** — 组卷、四种题型控件、草稿保存、计时器
- [x] **P5 阅卷** — 分层判分、rubric 逐点评分、SSE 进度、成绩报告、人工覆盖
- [x] **P6 历史** — 出题历史「再来一次」、阅卷历史「重刷此卷」、基础筛选
- [x] **提示词预设** — 5 个内置起步预设、出题页载入 / 另存为 / 删除用户预设
- [x] **出题前自动优化提示词** — 点「生成试卷」后先调模型做提示词工程，再用优化结果出题
- [x] **主分类筛选** — 粗粒度白名单分类；出题必选；试卷/出题历史/阅卷历史可筛
- [x] **能力仪表盘** — 弱项标签排行、题型得分、趋势曲线、累计统计、针对弱项出题
- [x] **错题本** — 自动入库、手动增删、按标签组卷重刷
