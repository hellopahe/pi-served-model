import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildSnapshot,
  extractPayloadModel,
  extractServedFromMessage,
  formatStatus,
  formatWidget,
  resolveRequested,
} from "../served-model.mjs";

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

  it("formats match, wait, and mismatch lines", () => {
    const match = buildSnapshot({ provider: "openai", requested: "gpt-5", served: "gpt-5" });
    assert.equal(match.mismatch, false);
    assert.equal(formatStatus(match), "模型 openai/gpt-5");

    const waiting = buildSnapshot({ provider: "openai", requested: "gpt-5" });
    assert.equal(formatStatus(waiting, { waiting: true }), "请求 openai/gpt-5 · 等待响应");

    const mismatch = buildSnapshot({
      provider: "openai",
      requested: "gpt-5",
      served: "gpt-4o-mini",
      servedSource: "responseModel",
    });
    assert.equal(mismatch.mismatch, true);
    assert.equal(formatStatus(mismatch), "请求 openai/gpt-5 · 返回 gpt-4o-mini");
    assert.deepEqual(formatWidget(mismatch), [
      "请求  openai/gpt-5",
      "返回  gpt-4o-mini",
      "来源  responseModel",
    ]);
  });
});

describe("extension events", () => {
  it("shows waiting, then a responseModel mismatch, then clears on shutdown", async () => {
    const packageDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
    const { loadExtensions } = await import(pathToFileURL(join(packageDist, "core/extensions/loader.js")).href);
    const root = fileURLToPath(new URL("../", import.meta.url));
    const loaded = await loadExtensions([join(root, "pi-served-model.ts")], root);
    assert.deepEqual(loaded.errors, []);
    const ext = loaded.extensions[0];

    let status;
    let widget;
    const notifies = [];
    const ctx = {
      mode: "tui",
      hasUI: true,
      model: { provider: "openai", id: "gpt-5" },
      ui: {
        theme: { fg: (_color, text) => text },
        setStatus(_key, value) {
          status = value;
        },
        setWidget(_key, value) {
          widget = value;
        },
        notify(message, level) {
          notifies.push({ message, level });
        },
      },
    };

    async function emit(type, props = {}) {
      for (const fn of ext.handlers.get(type) ?? []) {
        await fn({ type, ...props }, ctx);
      }
    }

    await emit("session_start");
    assert.equal(status, "模型 openai/gpt-5");
    assert.equal(widget, undefined);

    await emit("before_provider_request", { payload: { model: "gpt-5", messages: [] } });
    assert.equal(status, "请求 openai/gpt-5 · 等待响应");

    await emit("message_update", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(status, "请求 openai/gpt-5 · 返回 gpt-4o-mini");
    assert.deepEqual(widget, [
      "请求  openai/gpt-5",
      "返回  gpt-4o-mini",
      "来源  responseModel",
    ]);
    assert.deepEqual(notifies, [{ message: "请求 openai/gpt-5 · 返回 gpt-4o-mini", level: "warning" }]);

    await emit("message_update", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(notifies.length, 1, "mismatch notify once per request");

    await emit("message_end", {
      message: { role: "assistant", model: "gpt-5", responseModel: "gpt-4o-mini" },
    });
    assert.equal(status, "请求 openai/gpt-5 · 返回 gpt-4o-mini");

    await emit("session_shutdown");
    assert.equal(status, undefined);
    assert.equal(widget, undefined);
  });

  it("treats Anthropic message.model overwrite as the served id", async () => {
    const packageDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
    const { loadExtensions } = await import(pathToFileURL(join(packageDist, "core/extensions/loader.js")).href);
    const root = fileURLToPath(new URL("../", import.meta.url));
    const loaded = await loadExtensions([join(root, "pi-served-model.ts")], root);
    const ext = loaded.extensions[0];
    let status;
    const ctx = {
      mode: "tui",
      hasUI: true,
      model: { provider: "anthropic", id: "claude-sonnet-4-5" },
      ui: {
        setStatus(_key, value) {
          status = value;
        },
        setWidget() {},
        notify() {},
      },
    };
    async function emit(type, props = {}) {
      for (const fn of ext.handlers.get(type) ?? []) {
        await fn({ type, ...props }, ctx);
      }
    }
    await emit("session_start");
    await emit("before_provider_request", { payload: { model: "claude-sonnet-4-5" } });
    await emit("message_end", {
      message: { role: "assistant", model: "claude-sonnet-4-5-20250929" },
    });
    assert.equal(status, "请求 anthropic/claude-sonnet-4-5 · 返回 claude-sonnet-4-5-20250929");
  });
});
