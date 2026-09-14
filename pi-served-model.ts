import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildSnapshot,
  extractPayloadModel,
  extractServedFromMessage,
  formatStatus,
  formatWidget,
  resolveRequested,
} from "./served-model.mjs";

const KEY = "pi-served-model";

type Snapshot = ReturnType<typeof buildSnapshot>;

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

  const paint = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const text = formatStatus(snapshot, { waiting });
    const themed = snapshot.mismatch && ctx.ui.theme?.fg ? ctx.ui.theme.fg("warning", text) : text;
    ctx.ui.setStatus(KEY, themed);
    ctx.ui.setWidget(KEY, snapshot.mismatch ? formatWidget(snapshot) : undefined);
  };

  const resetToSelection = (ctx: ExtensionContext, keepWaiting = false) => {
    const { provider, id } = selected(ctx);
    snapshot = buildSnapshot({
      provider,
      requested: resolveRequested({ payloadModel, selectedId: id }),
    });
    waiting = keepWaiting;
    paint(ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    payloadModel = undefined;
    notified = false;
    resetToSelection(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    if (waiting) return;
    payloadModel = undefined;
    notified = false;
    resetToSelection(ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    payloadModel = extractPayloadModel(event.payload);
    notified = false;
    waiting = true;
    snapshot = buildSnapshot({
      provider: selected(ctx).provider,
      requested: requestedId(ctx),
    });
    paint(ctx);
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
    paint(ctx);
    if (snapshot.mismatch && !notified && ctx.hasUI) {
      notified = true;
      ctx.ui.notify(formatStatus(snapshot), "warning");
    }
  };

  pi.on("message_update", (event, ctx) => {
    onAssistant(event.message, ctx);
  });

  pi.on("message_end", (event, ctx) => {
    onAssistant(event.message, ctx);
    waiting = false;
    paint(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(KEY, undefined);
    ctx.ui.setWidget(KEY, undefined);
  });

  pi.registerCommand("served-model", {
    description: "Show requested vs served model id from the last provider response",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(formatStatus(snapshot, { waiting }), snapshot.mismatch ? "warning" : "info");
    },
  });
}
