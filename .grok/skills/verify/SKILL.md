---
name: verify
description: 跑 CodeSpar 验证循环（前端 lint + tsc，后端 mvn test）。在改完代码、准备交付、用户说验证/跑测试//verify 时使用。
---

# /verify

改完代码后执行，通过才可声称完成。不要跳过失败项。

## 步骤

在仓库根目录执行（按顺序，前一步失败则修到绿再继续）：

```bash
pnpm -C frontend lint
pnpm -C frontend exec tsc -b --pretty false
mvn -f backend/pom.xml -q test
```

## 判定

- lint / tsc / 测试任一项非零退出码 → 读报错、改代码、再跑，直到全绿
- 只改了 Markdown / 提示词文案且不影响编译：仍跑 tsc（模板路径和前端类型常被牵连）
- 不要为了让验证通过而删测试或加 `@Disabled`
- 不要调用浏览器 / Chrome DevTools 做点验；那是用户的事

## 回报

简短列出：跑了哪些命令、通过/失败、若失败已如何修。
