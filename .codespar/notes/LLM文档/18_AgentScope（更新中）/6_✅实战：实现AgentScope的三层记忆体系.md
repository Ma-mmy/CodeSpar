# ✅实战：实现AgentScope的三层记忆体系

基于长期记忆、持久化记忆以及智能上下文压缩实现一个三层记忆体系：



```java
import io.agentscope.core.ReActAgent;
import io.agentscope.core.formatter.dashscope.DashScopeChatFormatter;
import io.agentscope.core.memory.LongTermMemoryMode;
import io.agentscope.core.memory.autocontext.*;
import io.agentscope.core.memory.mem0.Mem0LongTermMemory;
import io.agentscope.core.message.Msg;
import io.agentscope.core.model.DashScopeChatModel;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.session.JsonSession;
import io.agentscope.core.session.Session;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.file.ReadFileTool;
import io.agentscope.core.tool.file.WriteFileTool;

import java.nio.file.Path;
import java.nio.file.Paths;

public class FullMemoryExample {

    public static void main(String[] args) {
        DashScopeChatModel chatModel = DashScopeChatModel.builder()
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .modelName("qwen3-max-preview")
                .stream(true)
                .enableThinking(true)
                .formatter(new DashScopeChatFormatter())
                .defaultOptions(GenerateOptions.builder().thinkingBudget(1024).build())
                .build();

        // 1. 长期记忆：跨会话语义检索
        Mem0LongTermMemory longTermMemory = Mem0LongTermMemory.builder()
                .apiKey(System.getenv("MEM0_API_KEY"))
                .userId("example-user")
                .apiBaseUrl("https://api.mem0.ai")
                .build();

        // 2. 短期记忆：AutoContextMemory（自动上下文压缩）
        // 当短期消息超过 token 上限时，自动总结早期消息以节省 token
        AutoContextConfig autoContextConfig = AutoContextConfig.builder()
                .tokenRatio(0.1)        // 触发压缩的阈值比例
                .lastKeep(20)            // 最近保留的消息数
                .build();
        AutoContextMemory memory = new AutoContextMemory(autoContextConfig, chatModel);

        // 3. 工具集
        Toolkit toolkit = new Toolkit();
        toolkit.registerTool(new ReadFileTool());
        toolkit.registerTool(new WriteFileTool());

        // 4. 完整 Agent 配置
        ReActAgent agent = ReActAgent.builder()
                .name("Assistant")
                .sysPrompt("You are a helpful AI assistant. Be friendly and concise.")
                .model(chatModel)
                .memory(memory)
                .maxIters(50)
                .longTermMemory(longTermMemory)
                .longTermMemoryMode(LongTermMemoryMode.STATIC_CONTROL)  // 也可以用 BOTH
                .enablePlan()                          // 启用计划模块
                .toolkit(toolkit)
                .hook(new AutoContextHook())          // 自动上下文压缩 Hook
                .build();

        // 5. Session 持久化
        String sessionId = "user_alice_session";
        Path sessionPath = Paths.get(System.getProperty("user.home"),
                ".agentscope", "examples", "sessions");
        Session session = new JsonSession(sessionPath);
        agent.loadIfExists(session, sessionId);  // 恢复短期记忆

        // 6. 多轮交互循环
        try {
            // ...用户输入循环...
            Msg userMsg = Msg.userMsg("...");
            Msg response = agent.call(userMsg).block();
            agent.saveTo(session, sessionId);  // 保存短期记忆 + 工具状态
            // 长期记忆已被 StaticLongTermMemoryHook 自动写入 Mem0
        } catch (Throwable e) {
            agent.saveTo(session, sessionId);  // 异常时也保存
        }
    }
}
```



```
		用户输入
          ↓
   ┌──────────────────┐
   │AutoContextMemory │  ← 短期记忆（带自动压缩）
   │  最近 20 条原文 +  │     超长后早期消息会被 LLM 总结
   │  早期对话摘要      │
   └──────────────────┘
          ↓
   ┌──────────────────┐
   │  JsonSession     │  ← 会话持久化（跨重启）
   │  序列化到磁盘      │     保存的是上面的短期记忆
   └──────────────────┘
          ↓
   ┌──────────────────┐
   │  Mem0LongTermMem │  ← 长期记忆（跨会话语义检索）
   │  向量化提取的事实   │     每轮自动写入，每轮自动召回
   └──────────────────┘
```
