# ✅Spring AI 核心特性：Advisor

Spring AI 中提供了一个灵活且强大的方式，可以用于拦截、修改和增强 Spring 应用中的 AI 交互功能，那就是Advisor，通过利用Advisor，开发者可以创建更复杂、可重用且易于维护的 AI 组件。



可以把Advisor理解为插件，比如我们想要实现记忆功能，就可以用到Memory相关的Advisor

![](../access/17630403818778a1cb3570c09422388cc89ae1ac49c80.png)

实现日志记录相关的功能，我们就可以添加一个日志的Advisor：

![](../access/176304038190398c2c7bdc48a43d486b891f888b2859e.png)



Spring AI中也提供了一些列内置的Advisor

![](../access/176304038192621c6e08c9035452d9dc15dd43b21d196.png)

我们看一下Advisor接口的定义，其实没啥东西，主要是他继承自Ordered，需要在他的所有视线中实现`int getOrder();` 这个方法。这个方法主要是用来设置各个Advisor的顺序的。

```java
public interface Advisor extends Ordered {
    int DEFAULT_CHAT_MEMORY_PRECEDENCE_ORDER = -2147482648;

    String getName();
}
```

他还有几个子接口。主要就是CallAdvisor、StreamAdvisor以及BaseAdvisor。

![](../access/1763040381916f7ce0f9a63ef441f90e275b80389dcbf.png)

其中最基础的两个接口，一个是CallAdvisor一个是StreamAdvisor，一个是给同步调用使用的，另一个是给流式调用使用的。别贴提供了adviseCall和adviseStream方法。

```java
public interface CallAdvisor extends Advisor {
    ChatClientResponse adviseCall(ChatClientRequest chatClientRequest, CallAdvisorChain callAdvisorChain);
}

public interface StreamAdvisor extends Advisor {
    Flux<ChatClientResponse> adviseStream(ChatClientRequest chatClientRequest, StreamAdvisorChain streamAdvisorChain);
}
```

其实Advisor的执行过程，就和AOP是一样的，他会把所有注册到一个chatClient上的Advisor都找出来，然后按顺序执行。

在DefaultChatClient中会有一个advisorChain，这里面就是所有注册进来的advisor，以此调用这些advisor的adviseCall方法。（如果是流式调用，就是调用adviseStream方法）

![](../access/17630403820066daa4b111b484d8fa85abb655fc0a817.png)

![](../access/176304038353499ed796b8b8445e9b146f8277612bd5f.png)

这个adviseCall方法是怎么实现的呢(adviseStream类似，拿adviseCall为例）？其实主要分4类：

![](../access/176304038372180a2ffedc3484dc2894285ece5e84355.png)

-   ChatModelCallAdvisor

-   SimpleLoggerAdvisor

-   SafeGuardAdvisor

-   BaseAdvisor


### ChatModelCallAdvisor

ChatModelCallAdvisor的adviseCall的实现很简单，就是直接调用chatModel的call方法，可以理解为直接和大模型交互了。

![](../access/176304038381969d9a020cfac4ba5afed9428ffa7af92.png)

因为直接直接要和大模型交互，其实这个advisor的话理论上应该是最后执行的，所以他的getOrder设置的是最低优先级。

```java
@Override
public int getOrder() {
    return Ordered.LOWEST_PRECEDENCE;
}
```

### SimpleLoggerAdvisor

这个是一个内置的日志打印的advisor，adviseCall实现如下：

![](../access/1763040383830d0d40e0484ad4adea25daed31a4b843d.png)

其实就是在调用下一个advisor之前先记录一下request的日志，在调用之后，再记录一下response的日志。

### SafeGuardAdvisor

这是一个spring ai内置的安全审查的advisor，其实主要的实现内容就是做敏感词拦截：

![](../access/176304038391861bbff19bcfc455bb86dbddfcb4e73d8.png)

### BaseAdvisor

这个是除了以上几个advisor之外，所有其他advisor的接口，他的实现充分的体现了AOP的机制：

![](../access/1763040384062b164ce2b2a514074a131b22cb528997f.png)

在调用下一个advisor之前，先调用自己的before方法，再调用拿到结果之后，再调用自己的after方法。

那么也就是说，我们可以自定义advisor的话，如果想在模型调用前或者调用后做一些其他事情，都可以实现这个接口，比如我们前面用到过很多次的MessageChatMemoryAdvisor

他的before和after实现如下，就是做记忆的记录。

![](../access/17630403841892efb24c6043b48cfb924b621ac4723ff.png)

最后，再贴一张spring ai官方给出的advisor的调用流程图：

![](../access/1763040384309d03bb9929af34b49be80ca20bbc81594.png)
