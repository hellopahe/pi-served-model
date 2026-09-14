import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildSnapshot,
  extractPayloadModel,
  extractServedFromMessage,
  formatLine,
  resolveRequested,
  shouldShow,
} from "../served-model.mjs";

function strip(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function widgetText(widget) {
  if (widget == null) return undefined;
  if (Array.isArray(widget)) return widget.join("\n");
  const component = widget(
    { requestRender() {} },
    { italic: (text) => text, fg: (_color, text) => text },
  );
  return strip(component.render(120).join("\n")).trimEnd();
}

describe("served-model helpers", () => {
  it("reads payload.model and ignores empty values", () => {
    assert.equal(extractPayloadModel({ model: "gpt-5" }), "gpt-5");
    assert.equal(extractPayloadModel({ model: "  claude-sonnet-4-5  " }), "claude-sonnet-4-5");
    assert.equal(extractPayloadModel({ model: "" }), undefined);
    assert.equal(extractPayloadModel({ model: 1 }), undefined);
    assert.equal(extractPayloadModel(null), undefined);
    assert.equal(extractPayloadModel({ messages: [] }), undefined);
  });

  it("prefers responseModel over message.model", () => {
    assert.deepEqual(
      extractServedFromMessage({
        role: "assistant",
        model: "gpt-5",
        responseModel: "gpt-4o-mini",
      }),
      { id: "gpt-4o-mini", source: "responseModel" },
    );
    assert.deepEqual(
      extractServedFromMessage({ role: "assistant", model: "claude-sonnet-4-5-20250929" }),
      { id: "claude-sonnet-4-5-20250929", source: "message.model" },
    );
    assert.equal(extractServedFromMessage({ role: "user", model: "gpt-5" }), undefined);
    assert.equal(extractServedFromMessage({ role: "assistant", model: "  " }), undefined);
  });

  it("uses the wire payload id as the requested id", () => {
    assert.equal(resolveRequested({ payloadModel: "gpt-5", selectedId: "other" }), "gpt-5");
    assert.equal(resolveRequested({ selectedId: "kimi-k2.5" }), "kimi-k2.5");
    assert.equal(resolveRequested({}), undefined);
  });

  it("formats wait, match, and mismatch lines and stays hidden when idle", () => {
    const idle = buildSnapshot({ provider: "openai", requested: "gpt-5" });
    assert.equal(shouldShow(idle, false), false);
    assert.equal(formatLine(idle), "");

    const waiting = buildSnapshot({ provider: "openai", requested: "gpt-5" });
    assert.equal(shouldShow(waiting, true), true);
    assert.equal(formatLine(waiting, { waiting: true }), "模型 · 请求 openai/gpt-5 · 等待响应");

    const match = buildSnapshot({ provider: "openai", requested: "gpt-5", served: "gpt-5" });
    assert.equal(match.mismatch, false);
    assert.equal(formatLine(match), "模型 · 返回 gpt-5");

    const mismatch = buildSnapshot({
      provider: "openai",
      requested: "gpt-5",
      served: "gpt-4o-mini",
      servedSource: "responseModel",
    });
    assert.equal(mismatch.mismatch, true);
    assert.equal(formatLine(mismatch), "模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini");
  });
});

describe("extension events", () => {
  async function load() {
    const packageDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
    const { loadExtensions } = await import(pathToFileURL(join(packageDist, "core/extensions/loader.js")).href);
    const root = fileURLToPath(new URL("../", import.meta.url));
    const loaded = await loadExtensions([join(root, "pi-served-model.ts")], root);
    assert.deepEqual(loaded.errors, []);
    return loaded.extensions[0];
  }

  function harness(model) {
    let widget;
    let placement;
    let status;
    const notifies = [];
    const ctx = {
      mode: "tui",
      hasUI: true,
      model,
      ui: {
        theme: { italic: (text) => text, fg: (_color, text) => text },
        setStatus(_key, value) {
          status = value;
        },
        setWidget(_key, value, options) {
          widget = value;
          placement = options?.placement;
        },
        notify(message, level) {
          notifies.push({ message, level });
        },
      },
    };
    return {
      ctx,
      notifies,
      get status() {
        return status;
      },
      get placement() {
        return placement;
      },
      get line() {
        return widgetText(widget);
      },
    };
  }

  it("stays hidden until a provider request, then paints an aboveEditor widget", async () => {
    const ext = await load();
    const ui = harness({ provider: "openai", id: "gpt-5" });
    async function emit(type, props = {}) {
      for (const fn of ext.handlers.get(type) ?? []) {
        await fn({ type, ...props }, ui.ctx);
      }
    }

    await emit("session_start");
    assert.equal(ui.line, undefined);
    assert.equal(ui.status, undefined);

    await emit("model_select", { model: ui.ctx.model });
    assert.equal(ui.line, undefined);
    assert.equal(ui.status, undefined);

    await emit("before_provider_request", { payload: { model: "gpt-5", messages: [] } });
    assert.equal(ui.placement, "aboveEditor");
    assert.equal(ui.line, "模型 · 请求 openai/gpt-5 · 等待响应");
    assert.equal(ui.status, undefined);

    await emit("message_update", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(ui.line, "模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini");
    assert.deepEqual(ui.notifies, [{ message: "模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini", level: "warning" }]);

    await emit("message_update", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(ui.notifies.length, 1, "mismatch notify once per request");

    await emit("message_end", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(ui.line, "模型 · 请求 openai/gpt-5 · 返回 gpt-4o-mini");

    await emit("session_shutdown");
    assert.equal(ui.line, undefined);
  });

  it("treats Anthropic message.model overwrite as the served id", async () => {
    const ext = await load();
    const ui = harness({ provider: "anthropic", id: "claude-sonnet-4-5" });
    async function emit(type, props = {}) {
      for (const fn of ext.handlers.get(type) ?? []) {
        await fn({ type, ...props }, ui.ctx);
      }
    }
    await emit("session_start");
    await emit("before_provider_request", { payload: { model: "claude-sonnet-4-5" } });
    await emit("message_end", {
      message: { role: "assistant", model: "claude-sonnet-4-5-20250929" },
    });
    assert.equal(ui.line, "模型 · 请求 anthropic/claude-sonnet-4-5 · 返回 claude-sonnet-4-5-20250929");
    assert.equal(ui.status, undefined);
  });
});
