# ✅AgentScope Java特性：长期记忆

> **📄 ✅什么是长期记忆**
>
> 前面我们讲过，Agent的记忆能力必不可少。Agent 的“记忆”是指其在与环境或用户交互过程中，用于存储、检索和利用信息的机制。这些信息可以包括： 没有记忆的 Agent 只能处理孤立的请求，无法实现上下文感知、个性化服务或持续改进。
>
> 来源：LLMentor



前面讲过了长期记忆，也介绍过如何在spring ai alibaba中接入mem0做长期记忆，agent scope也是支持长期记忆的。



### LongTermMemory

ASJ（AgentScope Java，后面都用ASJ缩写）中，提供了一个接口LongTermMemory来定义对长期记忆的支持：



```java
public interface LongTermMemory {
    Mono<Void> record(List<Msg> msgs);   // 记录：从消息中提取知识并存储
    Mono<String> retrieve(Msg msg);       // 检索：根据查询语义返回相关记忆文本
}
```



record 接收的是消息列表，由实现方（如 Mem0）使用 LLM 自动从对话中**提取**有价值的事实。retrieve 返回的是拼接好的文本，框架直接注入到模型上下文。



这个接口在ASJ中有多种实现：



![](../access/113ubdafabde391cce1d5269b7739eecfd21.png)



分别是BailianLongTermMemory、Mem0LongTermMemory和ReMeLongTermMemory。



```java
ReActAgent agent = ReActAgent.builder()
                .name("Assistant")
                .model(xxx)
                .longTermMemory(longTermMemory);
```



**BailianLongTermMemory**



BailianLongTermMemory是通过对接阿里云百炼平台的记忆服务（https://help.aliyun.com/zh/model-studio/memory-library ）来实现长期记忆的。



在百炼中专门提供了一个【记忆库】能力，开发者可以在上面创建一个记忆库来做长期记忆的存储。



![](../access/113uc8049442c0cb5de4b52754da9f411ed0.png)



```java
BailianLongTermMemory.builder()
    .apiKey(System.getenv("DASHSCOPE_API_KEY"))   // 阿里云 DashScope Key
    .userId("user_001")       // 必填
    .memoryLibraryId("lib_xxx")     // 记忆库 ID
    .projectId("proj_xxx")        // 项目 ID
    .profileSchema("schema_xxx")    // 用户画像 schema
    .topK(10)
    .minScore(0.5)       // 提高阈值，只要高相关结果
    .enableRerank(true)       // 启用重排序
    .enableJudge(true)       // 启用 LLM 判断
    .enableRewrite(true)       // 启用查询改写
    .metadata(Map.of("source", "mobile-app"))
    .build();
```

**Mem0LongTermMemory**



通过对接我们前面介绍过的mem0框架做长期记忆。在构造Mem0LongTermMemory的时候，指定apiBaseUrl、API\_KEY（如果使用百炼的托管服务才需要）即可，



```java
Mem0LongTermMemory.builder()
   .agentName("Assistant")     // 内部映射为 agentId（可选）
    .userId("user_123")       // 用户隔离（核心维度）
    .runId("session_456")      // 单次会话隔离（可选）
    .apiBaseUrl("https://api.mem0.ai") // PLATFORM默认地址
    .apiKey(System.getenv("MEM0_API_KEY"))  // 平台模式必填
    .apiType(Mem0ApiType.PLATFORM) // 或 SELF_HOSTED
    .metadata(Map.of("category", "travel", "lang", "zh"))
    .build();
```



**ReMeLongTermMemory**



这种实现，是对接ReMe这个长期记忆框架的，ReMe是agentscope团队开发的一个长期记忆框架，对标的就是mem0。



```java
ReMeLongTermMemory.builder()
    .userId("task_workspace")   // 必填，映射为 workspaceId
    .apiBaseUrl("http://localhost:8002")// ReMe服务地址
    .timeout(Duration.ofSeconds(120))   // 可选，HTTP 超时
    .build();
```



### LongTermMemoryMode



```java
ReActAgent agent = ReActAgent.builder()
                .name("Assistant")
                .model(xxx)
                .longTermMemory(longTermMemory)
.longTermMemoryMode(LongTermMemoryMode.STATIC_CONTROL)
                .build();
```



ASJ中的长期记忆支持三种工作模型：



```java
public enum LongTermMemoryMode {
    AGENT_CONTROL,    // Agent 自己决定何时记录/检索（注册为工具）
    STATIC_CONTROL,   // 框架自动管理（每轮自动检索+记录）
    BOTH              // 两者结合（推荐）
}
```



**AGENT\_CONTROL模式**，由 LongTermMemoryTools 实现，框架向 Toolkit 注册两个工具：

-   recordToMemory(thinking, content) — Agent 主动调用记录关键信息

-   retrieveFromMemory(keywords) — Agent 主动按关键词检索


Agent 通过 Function Calling 决定何时记忆/回忆。适合需要精细控制的场景，比如只在用户明确说"记住XXX"时才存。



**STATIC\_CONTROL 模式**， StaticLongTermMemoryHook 实现，关键流程：

-   **PreCallEvent**（推理前）：取出最后一条用户消息 → 调用 retrieve() → 用 <long\_term\_memory>...</long\_term\_memory> 标签包装结果 → 作为 USER role 消息（name="long\_term\_memory"）追加到输入消息末尾

-   **PostCallEvent**（回复后）：把 Memory 中所有消息传给 record() → 由后端（如 Mem0）自动提取关键信息并向量化存储


异步记录：可选 asyncRecord=true，使用专用的 boundedElastic scheduler（1 worker，队列 3），避免阻塞响应。



**BOTH 模式**，同时启用上述两种机制：框架自动后台记录全量对话 + Agent 在需要时主动召回。这是**推荐的默认模式**。



### 基于Mem0实现STATIC\_CONTROL 模式记忆



```java
mport io.agentscope.core.ReActAgent;
import io.agentscope.core.agent.user.UserAgent;
import io.agentscope.core.memory.LongTermMemoryMode;
import io.agentscope.core.memory.mem0.Mem0ApiType;
import io.agentscope.core.memory.mem0.Mem0LongTermMemory;
import io.agentscope.core.message.Msg;
import io.agentscope.core.model.DashScopeChatModel;

import java.util.HashMap;
import java.util.Map;

public class Mem0BasicExample {

    public static void main(String[] args) {
        String dashscopeApiKey = System.getenv("DASHSCOPE_API_KEY");
        String mem0ApiKey = System.getenv("MEM0_API_KEY");

        // 1. 配置 Mem0 长期记忆
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("agentName", "SmartAssistant");

        Mem0LongTermMemory longTermMemory = Mem0LongTermMemory.builder()
                .agentName("SmartAssistant")
                .userId("user_alice")           // 关键：每个用户一个隔离的记忆空间
                .apiBaseUrl("https://api.mem0.ai")
                .apiKey(mem0ApiKey)
                .apiType(Mem0ApiType.PLATFORM)
                .metadata(metadata)
                .build();

        // 2. 创建 Agent，启用 STATIC_CONTROL 模式
        ReActAgent agent = ReActAgent.builder()
                .name("Assistant")
                .model(DashScopeChatModel.builder()
                        .apiKey(dashscopeApiKey)
                        .modelName("qwen-plus")
                        .build())
                .longTermMemory(longTermMemory)
                .longTermMemoryMode(LongTermMemoryMode.STATIC_CONTROL)
                .build();

        // 3. 模拟首次对话：告诉 Agent 一些用户偏好
        Msg msg1 = Msg.userMsg("I'm allergic to peanuts and I love Italian food.");
        Msg reply1 = agent.call(msg1).block();
        System.out.println("Agent: " + reply1.getTextContent());

        Msg msg2 = Msg.userMsg("I usually exercise on Tuesdays and Thursdays.");
        Msg reply2 = agent.call(msg2).block();
        System.out.println("Agent: " + reply2.getTextContent());

        // === JVM 重启后，新建 Agent 实例（短期记忆全空）===
        // 但只要 userId 一致，长期记忆中的偏好仍可被检索到

        Mem0LongTermMemory longTermMemory2 = Mem0LongTermMemory.builder()
                .agentName("SmartAssistant")
                .userId("user_alice")           // 同样的 userId
                .apiBaseUrl("https://api.mem0.ai")
                .apiKey(mem0ApiKey)
                .build();

        ReActAgent agent2 = ReActAgent.builder()
                .name("Assistant")
                .model(DashScopeChatModel.builder()
                        .apiKey(dashscopeApiKey)
                        .modelName("qwen-plus")
                        .build())
                .longTermMemory(longTermMemory2)
                .longTermMemoryMode(LongTermMemoryMode.STATIC_CONTROL)
                .build();

        // 提问 - Agent 会自动检索到之前的过敏信息
        Msg msg3 = Msg.userMsg("Recommend a restaurant for dinner tonight.");
        Msg reply3 = agent2.call(msg3).block();
        System.out.println("Agent: " + reply3.getTextContent());
        // 输出会避开花生菜品，可能推荐意大利餐厅
    }
}
```



**基于Mem0实现AGENT\_CONTROL 模式记忆**



```java
import io.agentscope.core.ReActAgent;
import io.agentscope.core.memory.InMemoryMemory;
import io.agentscope.core.memory.LongTermMemoryMode;
import io.agentscope.core.memory.mem0.Mem0LongTermMemory;
import io.agentscope.core.message.Msg;
import io.agentscope.core.model.DashScopeChatModel;

public class AgentControlMemoryExample {

    public static void main(String[] args) {
        Mem0LongTermMemory longTermMemory = Mem0LongTermMemory.builder()
                .agentName("PersonalAssistant")
                .userId("user_bob")
                .apiBaseUrl("https://api.mem0.ai")
                .apiKey(System.getenv("MEM0_API_KEY"))
                .build();

        ReActAgent agent = ReActAgent.builder()
                .name("Assistant")
                .sysPrompt("""
                    You are a personal assistant. You have two memory tools:
                    - recordToMemory: save important user information for future
                    - retrieveFromMemory: recall info from past conversations

                    Use them PROACTIVELY when:
                    - User mentions preferences, allergies, schedules, personal facts
                    - User asks about something that might require past context
                    """)
                .model(DashScopeChatModel.builder()
                        .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                        .modelName("qwen-max")
                        .stream(true)
                        .build())
                .memory(new InMemoryMemory())
                .longTermMemory(longTermMemory)
                .longTermMemoryMode(LongTermMemoryMode.AGENT_CONTROL)
                // 框架自动注册 recordToMemory + retrieveFromMemory 工具到 toolkit
                .build();

        // Agent 会自主决定调用 recordToMemory 工具
        Msg msg1 = Msg.userMsg("Just FYI, I'm vegetarian and don't drink alcohol.");
        Msg reply1 = agent.call(msg1).block();
        // Agent 内部会触发：tool_call: recordToMemory(thinking="...", content=["User is vegetarian", "User doesn't drink alcohol"])

        // 后续对话 Agent 会自主调用 retrieveFromMemory 工具
        Msg msg2 = Msg.userMsg("Plan a dinner party menu for me.");
        Msg reply2 = agent.call(msg2).block();
        // Agent 内部会触发：tool_call: retrieveFromMemory(keywords=["food preferences", "diet"])
        // 取回结果后，给出符合素食且无酒精的菜单
    }
}
```



**STATIC\_CONTROL和AGENT\_CONTROL对比**

| 维度 | STATIC\_CONTROL | AGENT\_CONTROL |
| --- | --- | --- |
| 触发时机 | 每轮对话自动触发 | 由 LLM 决定调用工具 |
| 控制粒度 | 全部对话内容 | 精确到具体事实 |
| Token 消耗 | 较高（每轮都检索） | 较低（按需检索） |
| 模型依赖 | 不依赖工具调用能力 | 需要支持 Function Calling |
| 适合场景 | 简单 Agent、信息密集 | 智能 Agent、信息稀疏 |
| 召回率 | 高（只要语义相关就召回） | 中（依赖 LLM 判断） |
| 精确率 | 中（可能召回无关内容） | 高（LLM 主动选择） |



### 自定义实现 LongTermMemory



如果不想依赖 内置的长期记忆方案，可以自己实现，只需要实现LongTermMemory就行

```java
import io.agentscope.core.memory.LongTermMemory;
import io.agentscope.core.message.Msg;
import reactor.core.publisher.Mono;

import java.util.List;

public class CustomLongTermMemory implements LongTermMemory {

    private final VectorStore vectorStore;       // 你的向量库（如 Milvus/PGVector）
    private final EmbeddingModel embedder;       // 嵌入模型
    private final ChatModel summarizer;          // 用于知识抽取的 LLM
    private final String userId;

    @Override
    public Mono<Void> record(List<Msg> msgs) {
        // 1. 用 LLM 从消息中抽取关键事实
        return summarizer.extract(msgs, "Extract user preferences, facts, and decisions.")
                // 2. 向量化
                .flatMap(facts -> embedder.embed(facts))
                // 3. 存入向量库（带 userId 标签）
                .flatMap(vector -> vectorStore.save(userId, vector));
    }

    @Override
    public Mono<String> retrieve(Msg query) {
        // 1. 查询向量化
        return embedder.embed(query.getTextContent())
                // 2. 向量检索 Top-K（带 userId 过滤）
                .flatMap(qvec -> vectorStore.search(userId, qvec, 5))
                // 3. 拼接为文本返回
                .map(results -> String.join("\n", results));
    }
}
```
