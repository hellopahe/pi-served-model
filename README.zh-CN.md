# pi-served-model

[English](README.md)

为 Pi 在输入框上方的 widget 栈里显示**本次请求发出的模型 id**和**响应里回写的模型 id**，紧挨在先注册的 extension widget 下方，例如 pi-live-status。

只在 `before_provider_request` 之后出现。空闲、尚未发请求时不显示。OpenAI Chat Completions 在 SSE `model` 与请求 id 不同时写入 `AssistantMessage.responseModel`。Anthropic Messages 会在 `message_start` 用 `event.message.model` 覆盖 `AssistantMessage.model`。id 不一致时本轮只提醒一次。

## 安装

```bash
pi install git:github.com/hellopahe/pi-served-model
```

在已经打开的 Pi 中执行 `/reload`，或重新启动 Pi。

也可以将 `pi-served-model.ts` 和 `served-model.mjs` 复制到 `~/.pi/agent/extensions/` 后执行 `/reload`。两种方式选一种；从手工安装切换为 Git 安装时，先移除手工复制的文件，避免重复加载。

更新 Git 安装：

```bash
pi update git:github.com/hellopahe/pi-served-model
```

卸载 Git 安装：

```bash
pi remove git:github.com/hellopahe/pi-served-model
```

手工安装则删除复制的文件，之后执行 `/reload` 或重新启动。

## 显示

位置是 `aboveEditor` widget 栈，排在先注册的 widget 下面。颜色和斜体与 pi-live-status 相同。

| 状态 | 显示 |
| --- | --- |
| 空闲，还没发请求 | 隐藏 |
| 已发出请求，尚未读到模型字段 | `模型 · 请求 openai/gpt-5 · 等待响应` |
| 响应 id 与请求相同 | `模型 · 返回 gpt-5` |
| 响应 id 与请求不同 | `模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini` |

`/served-model` 用 notify 再显示一次当前行；还没有请求时显示 `还没有模型响应`。

## 返回 id 的来源

返回 id 来自响应解析结果：

- openai-completions 在 SSE `chunk.model` 与请求 id 不同时写入的 `responseModel`
- 否则使用 `message.model`，包括 Anthropic 从 `message_start` 覆盖的值

请求 id 优先取 `before_provider_request` 里 `payload.model`，没有该字段时用当前选中的 `ctx.model.id`。

openai-responses、openai-codex-responses、google-generative-ai 目前不写 `responseModel`。这些路径只有在改写 `message.model` 时才能看出换模。网关若原样回显请求 id，界面会显示为一致，即使后端跑了另一个模型。

## 实现

这是独立 extension，不编辑 Pi 安装目录内的源码、用户设置、模型配置、提示词、请求头或请求体，也不写请求日志。

它读取 `before_provider_request`、`message_update`、`message_end`。widget 只在交互式 TUI 中绘制。

## 兼容性

- 已在 **Pi 0.85.1、Node.js 24.19.0、macOS** 上验证。
- 依赖 Pi 按上文暴露 `responseModel` / `message.model`。适配器以后若改字段，扩展需要跟着更新。

## 本地测试

需要 Node.js 24+ 和 npm：

```bash
npm ci
npm test
```

测试覆盖 payload 解析、`responseModel` 与 `message.model`、空闲隐藏、`aboveEditor` 位置、一致/不一致文案，以及经 Pi loader 的事件路径。无需 API Key。

## 许可证

[MIT](LICENSE)。独立社区扩展，与 Pi、Anthropic、OpenAI 无隶属关系。
