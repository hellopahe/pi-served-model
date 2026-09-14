import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

const KEY = "pi-served-model";
const ORANGE = "\x1b[38;2;217;119;87m";

type Snapshot = {
  provider: string;
  requested: string;
  served?: string;
  servedSource?: string;
  mismatch: boolean;
};

function extractPayloadModel(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return;
  const model = (payload as { model?: unknown }).model;
  if (typeof model !== "string") return;
  const id = model.trim();
  return id || undefined;
}

function extractServedFromMessage(message: unknown): { id: string; source: string } | undefined {
  if (!message || typeof message !== "object") return;
  const value = message as { role?: unknown; responseModel?: unknown; model?: unknown };
  if (value.role !== "assistant") return;
  if (typeof value.responseModel === "string") {
    const id = value.responseModel.trim();
    if (id) return { id, source: "responseModel" };
  }
  if (typeof value.model === "string") {
    const id = value.model.trim();
    if (id) return { id, source: "message.model" };
  }
}

function resolveRequested({ payloadModel, selectedId }: { payloadModel?: string; selectedId?: string } = {}) {
  const fromPayload = typeof payloadModel === "string" ? payloadModel.trim() : "";
  if (fromPayload) return fromPayload;
  const fromSelected = typeof selectedId === "string" ? selectedId.trim() : "";
  return fromSelected || undefined;
}

function formatQualified(provider: string | undefined, id: string | undefined) {
  if (!id) return "";
  if (!provider) return id;
  if (id === provider || id.startsWith(`${provider}/`)) return id;
  return `${provider}/${id}`;
}

function buildSnapshot({
  provider,
  requested,
  served,
  servedSource,
}: {
  provider?: string;
  requested?: string;
  served?: string;
  servedSource?: string;
} = {}): Snapshot {
  const req = typeof requested === "string" ? requested.trim() : "";
  const sv = typeof served === "string" ? served.trim() : "";
  return {
    provider: typeof provider === "string" ? provider : "",
    requested: req,
    served: sv || undefined,
    servedSource,
    mismatch: Boolean(req && sv && req !== sv),
  };
}

function shouldShow(snapshot: Snapshot, waiting = false) {
  return Boolean(waiting || snapshot.served);
}

function formatLine(snapshot: Snapshot, { waiting = false } = {}) {
  const req = formatQualified(snapshot.provider, snapshot.requested);
  if (waiting && !snapshot.served) {
    return req ? `模型 · 请求 ${req} · 等待响应` : "模型 · 等待响应";
  }
  if (!snapshot.served) return "";
  if (snapshot.mismatch) return `模型 · 请求 ${req} · 返回 ${snapshot.served}`;
  return `模型 · 返回 ${snapshot.served}`;
}

export default function (pi: ExtensionAPI) {
  let payloadModel: string | undefined;
  let waiting = false;
  let notified = false;
  let snapshot: Snapshot = buildSnapshot({});

  const selected = (ctx: ExtensionContext) => ({
    provider: ctx.model?.provider ?? "",
    id: ctx.model?.id ?? "",
  });

  const requestedId = (ctx: ExtensionContext) =>
    resolveRequested({ payloadModel, selectedId: selected(ctx).id });

  const hide = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setWidget(KEY, undefined);
  };

  const paint = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    if (ctx.mode !== "tui" || !shouldShow(snapshot, waiting)) {
      hide(ctx);
      return;
    }
    const line = formatLine(snapshot, { waiting });
    ctx.ui.setWidget(
      KEY,
      (_tui, theme) => ({
        render(width: number) {
          if (!line || width < 1) return [];
          const text = theme.italic(`${ORANGE}${line}\x1b[39m`);
          return new Text(text, 0, 0).render(width).map((row) => truncateToWidth(row, width, ""));
        },
        invalidate() {},
      }),
      { placement: "aboveEditor" },
    );
  };

  const safe = (ctx: ExtensionContext, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      try {
        if (ctx.hasUI) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`pi-served-model: ${message}`, "error");
        }
      } catch {
        // Display failures must not abort the agent loop.
      }
    }
  };

  pi.on("session_start", (_event, ctx) => {
    payloadModel = undefined;
    waiting = false;
    notified = false;
    snapshot = buildSnapshot({});
    safe(ctx, () => hide(ctx));
  });

  pi.on("before_provider_request", (event, ctx) => {
    payloadModel = extractPayloadModel(event.payload);
    notified = false;
    waiting = true;
    snapshot = buildSnapshot({
      provider: selected(ctx).provider,
      requested: requestedId(ctx),
    });
    safe(ctx, () => paint(ctx));
  });

  const onAssistant = (message: unknown, ctx: ExtensionContext) => {
    const served = extractServedFromMessage(message);
    if (!served) return;
    snapshot = buildSnapshot({
      provider: selected(ctx).provider,
      requested: requestedId(ctx),
      served: served.id,
      servedSource: served.source,
    });
    safe(ctx, () => {
      paint(ctx);
      if (snapshot.mismatch && !notified && ctx.hasUI) {
        notified = true;
        ctx.ui.notify(formatLine(snapshot), "warning");
      }
    });
  };

  pi.on("message_update", (event, ctx) => {
    onAssistant(event.message, ctx);
  });

  pi.on("message_end", (event, ctx) => {
    onAssistant(event.message, ctx);
    waiting = false;
    safe(ctx, () => paint(ctx));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    safe(ctx, () => hide(ctx));
  });

  pi.registerCommand("served-model", {
    description: "Show requested vs served model id from the last provider response",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const line = formatLine(snapshot, { waiting });
      ctx.ui.notify(line || "还没有模型响应", snapshot.mismatch ? "warning" : "info");
    },
  });
}
