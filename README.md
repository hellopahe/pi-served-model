# pi-served-model

[中文说明](README.zh-CN.md)

A Pi extension that shows the model id the provider put on the wire, next to the id Pi sent.

The footer updates on each `message_update`. OpenAI Chat Completions fill `AssistantMessage.responseModel` when the SSE `model` field differs from the request. Anthropic Messages overwrite `AssistantMessage.model` with `message_start.model`. A mismatch also opens a widget above the editor and fires one warning notify per request.

## Install

```bash
pi install git:github.com/hellopahe/pi-served-model
```

Run `/reload` in an existing Pi session, or start a new session.

Alternatively, copy `pi-served-model.ts` and `served-model.mjs` into `~/.pi/agent/extensions/` and run `/reload`. Use one installation method: remove a manually copied version before installing the Git package to avoid loading the extension twice.

To update the Git installation:

```bash
pi update git:github.com/hellopahe/pi-served-model
```

To remove it:

```bash
pi remove git:github.com/hellopahe/pi-served-model
```

For a manual installation, delete the copied files. Reload or restart Pi afterward.

## Display

| State | Footer |
| --- | --- |
| Idle | `模型 openai/gpt-5` |
| Request sent, no model field yet | `请求 openai/gpt-5 · 等待响应` |
| Response model matches the request | `模型 openai/gpt-5` |
| Response model differs | `请求 openai/gpt-5 · 返回 gpt-4o-mini` |

`/served-model` repeats the latest line as a notify.

## What the served id is

The served id is the string from the provider payload:

- `responseModel`, when the openai-completions adapter sees SSE `chunk.model` differ from the requested id
- otherwise `message.model`, including Anthropic's overwrite from `message_start`

`before_provider_request` supplies the requested id from `payload.model`, falling back to the locally selected `ctx.model.id`.

openai-responses, openai-codex-responses, and google-generative-ai currently leave `responseModel` empty. Those paths only surface a swap when they change `message.model`. A gateway that echoes the requested id will look like a match even if another backend ran.

## How it works

This is an extension. It does not edit Pi's installed source files, settings, model catalog, prompts, headers, or request payloads. It does not write request logs.

It reads `before_provider_request`, `message_update`, and `message_end`. Interactive TUI and RPC can show status and the mismatch widget; print and JSON modes keep the same bookkeeping for `/served-model` when UI exists.

## Compatibility

- Tested with Pi **0.85.1** and Node.js **24.19.0** on macOS.
- Relies on Pi exposing `responseModel` / `message.model` as documented above. A future adapter change may require an extension update.

## Development

Requires Node.js 24+ and npm.

```bash
npm ci
npm test
```

Tests cover payload extraction, `responseModel` vs `message.model`, match and mismatch rendering, and the extension event path through Pi's loader. No provider account or API key is needed.

## License

[MIT](LICENSE). An independent community extension, unaffiliated with Pi, Anthropic or OpenAI.
