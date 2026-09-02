# CodeSpar 技术方案（v0.1）

> 配套文档：[PRD.md](./PRD.md)。本文只解决"怎么做"，范围限定 PRD 第 8 节的 **Step 1 闭环**。

---

## 0. 已确认的技术决策

| # | 决策项 | 结论 | 来源 |
|---|--------|------|------|
| 1 | 后端 | Java 21 + Spring Boot 3.5.x + Spring AI 1.1.2 + Spring AI Alibaba 1.1.2.0 | 你指定 |
| 2 | 数据库 | SQLite 3.x（xerial JDBC，单文件 `~/.codespar/codespar.db`，零部署） | 后续改选 |
| 3 | 前端 | React 19 + Vite + TypeScript + Tailwind + shadcn/ui | 我定 |
| 4 | 启动 | 一键脚本 + 生产构建（前端产物打进 jar，单进程） | 你指定 |
| 5 | 出题策略 | 按题型分批并发调用 | 你选 |
| 6 | 进度反馈 | Flux SSE 推送，前端 EventSource 接收 | 你选 |
| 7 | 首版范围 | Step 1 闭环：模型管理 → 出题 → 答题 → 阅卷 → 报告 → 历史 | 你选 |

**本机环境已探明**：JDK 21.0.11 (Zulu)、Maven 3.8.9、Node 22.22、pnpm 10.32。数据库用 **SQLite**（xerial JDBC 自带 macOS 原生库），无需安装任何数据库服务。

> 实施中发现的两处偏差：① `~/.local/bin/mysql_start.sh` 那个软链接已不存在，真实脚本在 `~/mmy/mysql-8.4.9-macos15-arm64/mysql_start.sh`；② macOS 自带 bash 3.2（无 `mapfile`、UTF-8 变量名解析有坑），脚本按 3.2 兼容写法编写。

---

## 1. 关于 Spring AI Alibaba 的定位（需要你知情）

先把话说明白，避免预期错位：

**Spring AI Alibaba 的主打能力是 Graph 工作流编排与多智能体协作（Agent Skills、并行执行、条件边）。而 CodeSpar 的 LLM 调用本质是"单轮 + 结构化输出"——出一批题、批一份卷，没有多轮规划、没有工具调用、没有智能体协作。所以 Graph 那套在本项目里用不上。**

实际用到的是它下层的 **Spring AI 1.1.2** 内核：`ChatClient`、`ChatModel`、`BeanOutputConverter`（结构化输出）、`Usage`（token 统计）。

因此本方案的做法是：

- 引入 `spring-ai-alibaba-bom` 统一版本管理（满足你的技术栈要求，且版本对齐更省心）
- 通义千问走 **`spring-ai-alibaba-starter-dashscope` 原生接入**，能拿到 DashScope 的原生特性
- 其余所有模型（DeepSeek、Kimi、智谱、OpenRouter…）走 **Spring AI 的 OpenAI 兼容客户端**
- 架构上用 `ProviderType` 枚举隔离，将来要接别家原生 SDK 只需加一个 `ChatModelProvider` 实现

这样引入它不浪费，也不会为了用而用。**如果你本来就打算后续把 Graph 用起来（比如做多智能体交叉阅卷、出题-审题-改题的流水线），那这个依赖就是提前铺路，P1 的"多模型陪审团阅卷"正好是 Graph 的典型场景。**

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器                                              │
│  React 19 + Vite + TS + Tailwind + shadcn/ui        │
│  TanStack Query（数据） / EventSource（SSE 进度）    │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / SSE  (同源，无跨域)
┌────────────────────▼────────────────────────────────┐
│  Spring Boot 3.5 单 jar（前端静态产物内嵌）           │
│                                                      │
│  web       Controller（REST + SSE）                  │
│  service   出题 / 答题 / 阅卷 / 统计                  │
│  ai        ChatModelFactory ← 核心：运行时动态建模型   │
│            PromptBuilder / OutputParser / 重试       │
│  repo      MyBatis-Plus Mapper                       │
└────────────────────┬────────────────────────────────┘
                     │ JDBC
              ┌─────────────┐        ┌──────────────┐
              │ SQLite 单文件│        │ 各家 LLM API │
              │ codespar.db │        │ OpenAI 兼容  │
              └─────────────┘        └──────────────┘
```

**单进程、同源、无跨域**——这是"一键脚本"能简单的前提。

---

## 3. 后端技术选型明细

| 层 | 选型 | 理由 |
|----|------|------|
| JDK | **21** | 本机已是 21；虚拟线程对"并发调多个 LLM"这种 IO 密集场景是天然收益 |
| 框架 | Spring Boot 3.5.4 | 与 Spring AI 1.1.2 / Spring AI Alibaba 1.1.2.0 版本对齐 |
| AI | Spring AI 1.1.2 + Spring AI Alibaba 1.1.2.0 | 见第 1 节 |
| ORM | **MyBatis-Plus 3.5.x** | 本项目有大量统计聚合 SQL（按标签算得分率、趋势），手写 SQL 比 JPA Criteria 直观得多；单表 CRUD 又能靠 BaseMapper 白嫖 |
| 迁移 | **Flyway** | schema 版本化，一键脚本里自动执行，不需要你手动建表 |
| 连接池 | HikariCP（Boot 自带） | 不折腾 |
| 参数校验 | Jakarta Validation | 出题参数（题量上限、必填项）在 Controller 层拦住 |
| 加密 | JDK 内置 AES-GCM | 加密存储 apiKey，见 5.3 |
| 反应式 | **reactor-core**（仅为 `Flux` SSE） | 主体仍是 Web MVC。实测只需 reactor-core 即可返回 `Flux<ServerSentEvent>`，**不必引 webflux starter**——引了反而会让 Boot 在 MVC/WebFlux 之间摇摆 |
| 测试 | JUnit 5 + Testcontainers（可选） | 首版先保证核心解析逻辑有单测 |

> **ORM 这条如果你更习惯 Spring Data JPA，告诉我，改起来成本很低。** 我选 MyBatis-Plus 主要是冲着仪表盘那些聚合查询。

---

## 4. 前端技术选型明细

| 项 | 选型 | 理由 |
|----|------|------|
| 框架 | React 19 + Vite | 快、生态成熟；Vite 构建产物直接进 jar |
| 语言 | TypeScript（strict） | 题目/评分的数据结构较复杂，类型是刚需 |
| 样式 | Tailwind CSS v4（CSS-first，无 tailwind.config.js） | 主题变量与自定义工具类全写在 `src/index.css` |
| 视觉 | **玻璃材质设计系统（自研）** | 见下方「设计系统」 |
| 数据 | TanStack Query | 缓存/失效/轮询/乐观更新全包 |
| 路由 | React Router v7 | 页面不多，够用 |
| 状态 | Zustand | 只用于"当前答题会话"这类跨组件状态，不上 Redux |
| 图表 | **Recharts** | 仪表盘的条形图/折线图；轻、React 原生 |
| Markdown | react-markdown + rehype-highlight | 题干、参考答案、点评均为 Markdown；作答区支持编辑+预览 |
| 草稿 | localStorage + 防抖 | PRD F4.2 要求刷新不丢；同时定期同步后端兜底 |

### 设计系统（玻璃材质）

全部实现在 `frontend/src/index.css`，无第三方 UI 库依赖。

**三条核心规则**：

1. **玻璃 = 模糊 + 提饱和 + 内高光**。`backdrop-filter: blur(20px) saturate(180%)` —— `saturate` 是关键，没有它透过玻璃的颜色会灰蒙蒙；再叠一条 `inset 0 1px 0` 的顶部内高光模拟玻璃边缘反光。封装为 `.glass` / `.glass-strong`（后者用于侧边栏、顶栏、抽屉等悬浮层）。
2. **背景必须有层次**。四团 `radial-gradient` 柔光（紫 / 青 / 品红 / 绿）+ `background-attachment: fixed`，滚动时背景不动，更像原生 App。**光晕不透明度不能低**：初版设 0.2–0.28 时整屏白茫茫，玻璃透不出颜色，实测提到 0.45–0.55 才有质感。
3. **圆角基准 `--radius: 1rem`**，卡片 `rounded-2xl`，配合大留白。

**性能与可访问性**：移动端把模糊半径降到 16px（`backdrop-filter` 层层叠加很吃 GPU）；`prefers-reduced-motion` 下关闭全部过渡。

### 组件层（一致性的真正保障）

设计 token 只能保证"色相不跑偏"，保证不了"同一个按钮在两个页面长得不一样"。所以在 token 之上还有一层组件：

**分工原则**：复杂交互用 Radix primitives（焦点管理、键盘导航、ARIA 属性它已经做对了，自己写极易出无障碍 bug），纯展示与简单表单自己写 + CVA 管理变体。皮肤一律自研，全部走设计 token。

| 文件 | 组件 | 底层 |
|------|------|------|
| `ui/button.tsx` | Button（5 变体 × 5 尺寸 + loading） | CVA + Radix Slot |
| `ui/field.tsx` | Field / Input / Textarea / Label | 自研 |
| `ui/select.tsx` | Select 全家 | Radix Select |
| `ui/toggles.tsx` | Switch / Checkbox / RadioGroup / OptionCard | Radix |
| `ui/feedback.tsx` | Badge / Alert / Progress / Skeleton / Spinner / Separator / EmptyState | Radix Progress + 自研 |
| `ui/dialog.tsx` | Dialog 全家 | Radix Dialog |
| `ui/toast.tsx` | ToastProvider / useToast | Radix Toast |
| `ui/disclosure.tsx` | Tabs / Accordion / Tooltip | Radix |
| `ui/table.tsx` | Table 全家 | 自研 |

**两条硬约束**：

1. **页面只从 `@/components/ui` 引入**，不直接 import Radix primitives，也不在页面里手写玻璃样式——所有视觉决策收敛在组件层。
2. **`Field` 自动接线** `htmlFor` / `id` / `aria-describedby`，页面不用手写这些，也就不会漏。

几个为业务专门设计的细节：`Table` 外层强制 `overflow-x-auto`（历史页列多，必须表格自己横向滚动，绝不能撑出页面横向滚动条）；`DialogFooter` 在移动端按钮竖排全宽；`OptionCard` 让整块区域可点而不只是小圆点（手机上点击区域够大）；`useToast` 的 `duration` 可设长，供出题/阅卷失败时展示完整报错。

### 组件总览页 `/_ui`

集中展示所有组件的全部状态（普通/悬停/禁用/错误/加载/空）。**改动设计 token 后先看这一页**，深浅色各过一遍，能立刻发现全局影响。不进导航栏，直接访问 `http://localhost:8080/_ui`。

### 响应式策略

断点单一，`md`（768px）：

| 视口 | 导航形态 |
|------|----------|
| ≥ 768px | 左侧固定玻璃侧边栏（`fixed inset-y-3 left-3`，悬浮不贴边），主内容 `md:pl-[15.75rem]` |
| < 768px | 顶部粘性玻璃条 + 汉堡按钮 → 右侧滑出抽屉；路由变化自动关闭，打开时锁定 body 滚动 |

页面统一用 `PageContainer`（`max-w-5xl` + 移动端 `px-4` / 桌面 `px-6`）与 `GlassCard` 两个封装，保证各页间距一致。

### 页面清单（Step 1）

```
/                    仪表盘（Step 1 先放"最近考试 + 快捷入口"占位，统计留到 Step 2）
/models              模型管理（列表 / 新增 / 连通测试）
/generate            出题（表单 → SSE 进度 → 预览页 → 确认组卷）
/exams               考试列表
/exams/:id/take      答题（题号导航 + 计时器 + 作答区）
/exams/:id/report    成绩报告
/history/generations 出题历史
/history/gradings    阅卷历史
```

---

## 5. 三个关键设计点

这三点是本项目真正的技术难点，其余都是常规 CRUD。

### 5.1 运行时动态模型工厂（核心）

**问题**：Spring AI 的标准用法是在 `application.yml` 里配 `spring.ai.openai.api-key`，启动时自动装配出一个 `ChatModel` Bean。但 PRD 要求你在 **UI 里随时增删模型配置，出题/阅卷时任选一个**——配置在数据库里，且运行时会变。静态自动配置完全不适用。

**方案**：不使用自动配置的 ChatModel Bean，改为按需构造。

```java
public interface ChatModelProvider {
    ProviderType type();                       // OPENAI_COMPATIBLE / DASHSCOPE
    ChatModel build(ModelProfile profile);     // 运行时构造
}

// OpenAI 兼容实现（覆盖 DeepSeek / Kimi / 智谱 / OpenRouter / 硅基流动 ...）
OpenAiApi api = OpenAiApi.builder()
        .baseUrl(profile.getBaseUrl())
        .apiKey(decrypt(profile.getApiKeyCipher()))
        .build();

OpenAiChatOptions options = OpenAiChatOptions.builder()
        .model(profile.getModelName())
        .temperature(profile.getTemperature())
        .maxTokens(profile.getMaxTokens())
        .build();

ChatModel model = OpenAiChatModel.builder()
        .openAiApi(api)
        .defaultOptions(options)
        .build();
```

**缓存**：`ChatModelFactory` 内部用 `ConcurrentHashMap<CacheKey, ChatModel>`，`CacheKey = profileId + updatedAt`。配置一改 `updatedAt` 就变，缓存自然失效，无需手动清理。

**连通性测试（PRD F1.2）**：用同一条路径构造出实例，发一条 `"ping"` 短请求，设 8 秒超时，返回延迟 + 响应片段 + token 消耗。失败时把厂商返回的原始错误信息透传给前端——**401/404/model not found 这类错误必须让你看到原文，否则排查配置极其痛苦**。

### 5.2 结构化输出与容错解析（质量命门）

PRD 要求 JSON 解析成功率 > 95%。这是全项目最大的不确定性来源。四道防线：

**防线一：Schema 注入 prompt**
用 Spring AI 的 `BeanOutputConverter<QuestionBatchDTO>` 生成 JSON Schema 并追加到 prompt 尾部，明确告知模型输出格式。

**防线二：不依赖 `response_format`**
很多 OpenAI 兼容端点对 `response_format: json_schema` 支持不完整或直接报错。方案是：`ModelProfile` 上带一个 `supportsJsonMode` 开关，**默认关闭**；开启时才下发该参数。不开启也能靠防线一+三工作。

**防线三：宽松解析器**
自己写 `LenientJsonParser`，按顺序尝试：
1. 直接 `ObjectMapper.readValue`
2. 剥离 ` ```json ... ``` ` 围栏后再解析
3. 提取首个 `{` 到末个 `}`（或 `[`…`]`）的子串再解析
4. 修复常见畸形：尾随逗号、中文全角引号、未转义换行

**防线四：分级重试**
解析失败 → 把错误信息回灌给模型要求修正（最多 2 次）→ 仍失败则该批次标记失败，**保留原始输出存库**，前端展示原文并允许你手动修正或丢弃。**绝不静默丢题**（PRD NFR4）。

**校验**：解析成功后还要做业务校验——rubric 分值之和是否等于满分、选择题正确选项是否在选项列表内、题型是否匹配。不合格触发重试。

### 5.3 API Key 安全存储

- 存库字段为 `api_key_cipher`，**AES-256-GCM 加密**
- 主密钥来源优先级：环境变量 `CODESPAR_MASTER_KEY` → 本地文件 `~/.codespar/master.key`（首次启动自动生成，权限 600）
- **返回给前端的 DTO 永远是掩码**（`sk-abc…xyz`），明文只在服务端解密后直接用于构造 HTTP 客户端
- Logback 配置屏蔽敏感字段；导出功能（PRD NFR6）显式排除 key

---

## 6. 出题流程实现（按题型分批并发 + SSE）

```
POST /api/generations          → 立即返回 jobId，异步开跑
GET  /api/generations/{id}/stream  → Flux<ServerSentEvent> 实时进度
```

**执行流程**：

```
1. 落库 GenerationJob(status=RUNNING)，返回 jobId
2. 按题型拆批：[选择×5] [填空×3] [问答×4] [设计×1]
3. 去重上下文：查同标签历史题干 → 摘要 → 注入各批 prompt（PRD F3.2 事前防线）
4. 虚拟线程并发执行 4 批，Semaphore 限并发（默认 4，可配）
   每批：构造 prompt → 调模型 → 宽松解析 → 业务校验 → 失败重试
   每批完成 → sink.tryEmitNext(进度事件)
5. 汇总 → 落库 Question（status=DRAFT）→ 累计 token/耗时 → job=SUCCESS/PARTIAL/FAILED
6. 推送 done 事件，complete sink
```

**SSE 事件类型**：`batch_started` / `batch_done` / `batch_failed` / `progress` / `done`。每个事件带已完成题数、累计 token、耗时。

**中途取消（PRD F2.3）**：`POST /api/generations/{id}/cancel` 置取消标志，各批在调用前检查；已完成批次的题目保留为草稿。

**预览确认**：生成的题先是 `DRAFT`。你在预览页删题、单题重生成（`POST /api/questions/{id}/regenerate`，可带修改意见），点"确认组卷"后才转 `ACTIVE` 并创建 `Exam`。

**关于 Flux 与断线**：SSE 连接断了不影响后台任务（任务跑在独立虚拟线程里，不绑定请求生命周期）。前端重连时先调 `GET /api/generations/{id}` 拿当前快照，再续接流——**这一点很重要，否则刷个页面就看不到进度了**。

---

## 7. 阅卷流程实现

```
POST /api/exams/{id}/submit  { gradingModelId }   → 返回 gradingId
GET  /api/gradings/{id}/stream                    → SSE 进度
```

**分层判分（PRD F5.1）**：

| 题型 | 判分方式 | 是否调模型 |
|------|----------|-----------|
| 选择 / 判断 | 本地比对正确选项 | ❌ 零 token |
| 填空 | 归一化（去空格/大小写/全半角）比对标准答案 + 同义表述列表 | 命中则否；未命中才调模型判语义等价 |
| 概念问答 / 系统设计 | 模型按 rubric 逐要点评分 | ✅ |

**主观题并发**：同样是虚拟线程 + Semaphore（默认 3，阅卷 prompt 更长，并发别开太大）。单题失败可单独重试（`POST /api/gradings/{id}/questions/{qid}/retry`），不影响整卷。

**阅卷 prompt 输入**：题干 + 参考答案 + rubric（含每点分值）+ 你的作答。
**要求输出**：每个 rubric 要点的命中状态（HIT / PARTIAL / MISS）+ 该点得分 + 整题点评。**得分由后端按要点汇总计算，不让模型自己算总分**——模型算术不可靠，这样也保证了分数与要点命中的一致性。

**人工覆盖（PRD F5.5）**：`PATCH /api/gradings/{id}/questions/{qid}` 传新分数 + 理由，记 `manual_override=true`，报告页标注。

---

## 8. 数据库设计

库为单文件 SQLite（`~/.codespar/codespar.db`），Flyway 管理迁移。MySQL → SQLite 的转换约定：
`BIGINT` 自增 → `INTEGER PRIMARY KEY AUTOINCREMENT`；`VARCHAR/TEXT/MEDIUMTEXT/JSON` → `TEXT`；
`TINYINT` → `INTEGER`；`DECIMAL` → `NUMERIC`；`DATETIME(3)` → `TEXT`；索引独立成 `CREATE INDEX`；
`INSERT IGNORE` → `INSERT OR IGNORE`。**时间戳由应用侧 `MybatisMetaObjectHandler` 自动填充**
（SQLite 没有 `ON UPDATE CURRENT_TIMESTAMP`，而 ChatModelFactory 缓存依赖 `updated_at` 变化）。

```
model_profile      模型配置（name, provider_type, base_url, api_key_cipher, model_name,
                              can_generate, can_grade, temperature, max_tokens,
                              supports_json_mode, enabled, is_default_gen, is_default_grade)
tag                知识点标签（name UNIQUE）
prompt_preset      提示词预设（name, prompt, params_json）

generation_job     出题任务（prompt, params_json, model_profile_id, status,
                             prompt_tokens, completion_tokens, cost_ms, error_msg, raw_output)
question           题目（job_id, type, difficulty, stem, options_json, correct_answer,
                        reference_answer, rubric_json, full_score, explanation,
                        status[DRAFT/ACTIVE/ARCHIVED], edited_by_user, stem_hash)
question_tag       题目↔标签（N:N）

exam               试卷（name, source[GENERATED/MANUAL/WRONG_BOOK], status, time_limit_min,
                         started_at, submitted_at, total_score, full_score, score_rate,
                         grading_model_profile_id）
exam_question      试卷↔题目（exam_id, question_id, seq）
answer             作答（exam_id, question_id, content, flagged, updated_at）

grading            阅卷（exam_id, model_profile_id, status, total_score,
                        prompt_tokens, completion_tokens, cost_ms）
question_grading   单题评分（grading_id, question_id, score, full_score,
                            rubric_result_json, comment, manual_override, override_reason）
```

**索引要点**：`question.stem_hash`（去重快速比对）、`question_tag(tag_id, question_id)`（弱项聚合）、`generation_job.created_at`、`exam.submitted_at`。

**JSON 字段**：SQLite 无原生 JSON 类型，一律以 `TEXT` 存储，应用侧用 Jackson 序列化/反序列化。结构会随迭代变化，用文本存比拆表灵活得多，且这些字段不需要独立查询。

**去重实现（PRD F3.2 事后防线）**：`stem_hash` 存题干归一化后的 SimHash。新题与同标签题目比汉明距离，超阈值标记疑似重复。**首版不引入向量库**——本地单人题量有限（预计几千题内），SimHash + 关键词 Jaccard 足够，且零外部依赖。真到量大了再上 embedding。

---

## 9. 工程结构

```
CodeSpar/
├── docs/
│   ├── PRD.md
│   └── TECH_DESIGN.md
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/codespar/
│       │   ├── CodeSparApplication.java
│       │   ├── ai/          ChatModelFactory, ChatModelProvider, PromptBuilder,
│       │   │                LenientJsonParser, RetryPolicy
│       │   ├── model/       实体 / DTO / 枚举
│       │   ├── mapper/      MyBatis-Plus Mapper
│       │   ├── service/     GenerationService, ExamService, GradingService, ModelProfileService
│       │   ├── web/         Controller + 全局异常处理
│       │   └── config/      AsyncConfig(虚拟线程), CryptoConfig, MyBatisConfig
│       └── resources/
│           ├── application.yml
│           ├── db/migration/    Flyway V1__init.sql ...
│           ├── prompts/         出题/阅卷 prompt 模板（.st 文件，与代码分离便于调优）
│           └── static/          ← 前端构建产物（build 时注入，git 忽略）
├── frontend/
│   ├── package.json / vite.config.ts / tailwind.config.ts
│   └── src/  { pages, components, api, hooks, store, types }
└── scripts/
    ├── build.sh      前端 build → 拷进 static → mvn package
    ├── start.sh      检查并启动 MySQL → 建库 → 启动 jar → 打开浏览器
    └── dev.sh        开发模式：MySQL + Spring Boot + Vite dev（前端代理到 8080）
```

**Prompt 模板独立成文件**（`resources/prompts/*.st`）：出题质量的调优 90% 是在改 prompt，放在代码字符串里每次都要重新编译，放文件里改完重启即可。

---

## 10. 一键脚本设计

### `scripts/start.sh`（生产模式）

```bash
1. 确保 ~/.codespar 目录存在（SQLite 文件不自动建父目录）
2. 若 target/codespar.jar 不存在 → 自动调 build.sh
3. java -jar target/codespar.jar（SQLite 文件自动创建 + Flyway 自动建表/迁移）
4. 健康检查通过后 open http://localhost:8099
```

### `scripts/build.sh`

```bash
cd frontend && pnpm install && pnpm build
rm -rf backend/src/main/resources/static/* && cp -r frontend/dist/* backend/src/main/resources/static/
cd backend && mvn -q clean package -DskipTests
```

### `scripts/dev.sh`（开发模式）

MySQL + `mvn spring-boot:run`（8080）+ `pnpm dev`（5173，Vite 代理 `/api` → 8080）。前端热更新，后端 devtools 热重启。

---

## 11. 实施计划（Step 1）

分 6 个阶段，每阶段结束都有可验证产物：

| 阶段 | 内容 | 验证方式 |
|------|------|----------|
| **P1 地基** | Maven 骨架、Flyway schema、MyBatis-Plus、前端脚手架、三个脚本 | `start.sh` 能起来，页面出 Hello，表已建好 |
| **P2 模型管理** | ChatModelFactory + 加密存储 + CRUD + 连通测试 UI | 配上你的真实 key，点"测试连接"返回真实响应 |
| **P3 出题** | Prompt 模板、分批并发、宽松解析、SSE 进度、预览页 | 一段提示词出一套完整题目，进度条实时动 |
| **P4 答题** | 组卷、答题页、四种题型控件、草稿保存、计时器、交卷 | 完整答完一套题，中途刷新不丢 |
| **P5 阅卷** | 分层判分、rubric 评分、SSE 进度、成绩报告页、人工覆盖 | 交卷后拿到逐要点的评分报告 |
| **P6 历史** | 出题历史（含"再来一次"）、阅卷历史（含"重刷此卷"）、筛选 | 两类历史可回看、可复用 |

**建议在 P3 结束后停下来实测出题质量**——如果模型出的题不够好，问题在 prompt 而不在代码，那时调 prompt 的成本远低于全做完再返工。

---

## 12. 已知风险

| 风险 | 影响 | 应对 |
|------|------|------|
| **模型出题质量不稳定**（最大风险） | 题目太浅/偏离/重复，产品价值归零 | prompt 模板外置便于快速迭代；预览页允许删题重生成；P3 后先实测再继续 |
| JSON 解析失败 | 出题中断 | 四道防线（5.2）；保留原始输出可人工挽救 |
| 各家兼容端点行为差异 | 某些模型不可用 | `supportsJsonMode` 等能力开关按 profile 配置；错误信息原文透传 |
| 长输出被 max_tokens 截断 | 整批题丢失 | 按题型分批已显著缩短单次输出；`max_tokens` 可按 profile 配；截断可检测并降低批量重试 |
| rubric 分值与满分不一致 | 分数算错 | 后端按要点汇总算分，不信模型的总分；解析后做分值校验 |
| SSE 连接断开 | 看不到进度 | 任务独立于请求生命周期；重连先拉快照再续流 |

---

## 13. 补充确认（已定稿）

1. **ORM**：MyBatis-Plus。
2. **构建工具**：Maven（本机 3.8.9）。
3. **端口**：8099（默认，可用 `CODESPAR_PORT` 覆盖）。
4. **厂商模板预置**：DeepSeek、通义千问/DashScope（含原生 + 兼容两种接法）。

### 关于「模板」与「自定义」的关系（重要）

模板**不是白名单**，只是自动填 baseURL 的快捷方式。模型管理表单的 `baseURL / apiKey / model 名` 三个字段**永远可编辑**，选「自定义」即全部手填。

技术上，`OpenAiCompatibleProvider` 拿到的就是用户填的三个值，直接 `OpenAiApi.builder().baseUrl(x).apiKey(y)` 构造，**代码里没有任何厂商判断**。因此以下场景无需改代码即可接入：

| 场景 | baseURL |
|------|---------|
| 硅基流动 / Groq / 智谱 / 百川 等 | 各自兼容端点 |
| 本地 Ollama | `http://localhost:11434/v1`（apiKey 任意非空） |
| 本地 vLLM / LM Studio | `http://localhost:8000/v1` |
| 公司内网 LLM 网关 | 内网地址 |
| OpenRouter | `https://openrouter.ai/api/v1` |

模板列表实现为一个前端常量数组，日后增删只是改数组。

**唯一走非兼容路径的是 DashScope 原生**（`ProviderType.DASHSCOPE`，走 spring-ai-alibaba-starter-dashscope）。通义也可选兼容模式 `https://dashscope.aliyuncs.com/compatible-mode/v1`，两条路都保留，由 `ModelProfile.providerType` 区分。

---

## 附：版本对齐表

```
JDK                     21
Spring Boot             3.5.4
Spring AI               1.1.2      (spring-ai-bom)
Spring AI Alibaba       1.1.2.0    (spring-ai-alibaba-bom)
MyBatis-Plus            3.5.x
SQLite                  3.x        (xerial sqlite-jdbc 内置)
Node / pnpm             22.22 / 10.32
React / Vite / TS       19 / 7 / 5.x
```

Sources:
- [Spring AI Alibaba 版本说明](https://java2ai.com/docs/versions/)
- [Spring AI OpenAI Chat 参考文档](https://docs.spring.io/spring-ai/reference/api/chat/openai-chat.html)
- [Spring AI ChatClient API](https://docs.spring.io/spring-ai/reference/api/chatclient.html)
