# pi-served-model

[中文说明](README.zh-CN.md)

A Pi extension that shows the model id the provider put on the wire, in an `aboveEditor` widget stacked under other editor widgets such as pi-live-status.

The line appears only after `before_provider_request`. Idle sessions stay blank. OpenAI Chat Completions fill `AssistantMessage.responseModel` when the SSE `model` field differs from the request. Anthropic Messages overwrite `AssistantMessage.model` with `message_start.model`. A mismatch fires one warning notify per request.

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

The widget sits in the `aboveEditor` stack, directly under widgets that registered earlier. It uses the same orange italic styling as pi-live-status.

| State | Widget |
| --- | --- |
| Idle, no request yet | hidden |
| Request sent, no model field yet | `模型 · 请求 openai/gpt-5 · 等待响应` |
| Response model matches the request | `模型 · 返回 gpt-5` |
| Response model differs | `模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini` |

`/served-model` repeats the latest line as a notify, or `还没有模型响应` when nothing has been sent.

## What the served id is

The served id is the string from the provider payload:

- `responseModel`, when the openai-completions adapter sees SSE `chunk.model` differ from the requested id
- otherwise `message.model`, including Anthropic's overwrite from `message_start`

`before_provider_request` supplies the requested id from `payload.model`, falling back to the locally selected `ctx.model.id`.

openai-responses, openai-codex-responses, and google-generative-ai currently leave `responseModel` empty. Those paths only surface a swap when they change `message.model`. A gateway that echoes the requested id will look like a match even if another backend ran.

## How it works

This is an extension. It does not edit Pi's installed source files, settings, model catalog, prompts, headers, or request payloads. It does not write request logs.

It reads `before_provider_request`, `message_update`, and `message_end`. The widget is TUI-only. `/served-model` still reports the last line when UI exists.

## Compatibility

- Tested with Pi **0.85.1** and Node.js **24.19.0** on macOS.
- Relies on Pi exposing `responseModel` / `message.model` as documented above. A future adapter change may require an extension update.

## Development

Requires Node.js 24+ and npm.

```bash
npm ci
npm test
```

Tests cover payload extraction, `responseModel` vs `message.model`, idle hiding, `aboveEditor` placement, match and mismatch rendering, and the extension event path through Pi's loader. No provider account or API key is needed.

## License

[MIT](LICENSE). An independent community extension, unaffiliated with Pi, Anthropic or OpenAI.
