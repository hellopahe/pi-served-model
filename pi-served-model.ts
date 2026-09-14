import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import {
  buildSnapshot,
  extractPayloadModel,
  extractServedFromMessage,
  formatLine,
  resolveRequested,
  shouldShow,
} from "./served-model.mjs";

const KEY = "pi-served-model";
const ORANGE = "\x1b[38;2;217;119;87m";

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

  pi.on("session_start", (_event, ctx) => {
    payloadModel = undefined;
    waiting = false;
    notified = false;
    snapshot = buildSnapshot({});
    hide(ctx);
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
      ctx.ui.notify(formatLine(snapshot), "warning");
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
    hide(ctx);
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
