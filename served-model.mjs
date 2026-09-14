/**
 * Requested vs served model-id helpers.
 * Display-only: no payload mutation, logging, or routing.
 */

export function extractPayloadModel(payload) {
  if (!payload || typeof payload !== "object") return;
  const model = payload.model;
  if (typeof model !== "string") return;
  const id = model.trim();
  return id || undefined;
}

export function extractServedFromMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.role !== "assistant") return;
  if (typeof message.responseModel === "string") {
    const id = message.responseModel.trim();
    if (id) return { id, source: "responseModel" };
  }
  if (typeof message.model === "string") {
    const id = message.model.trim();
    if (id) return { id, source: "message.model" };
  }
}

export function resolveRequested({ payloadModel, selectedId } = {}) {
  const fromPayload = typeof payloadModel === "string" ? payloadModel.trim() : "";
  if (fromPayload) return fromPayload;
  const fromSelected = typeof selectedId === "string" ? selectedId.trim() : "";
  return fromSelected || undefined;
}

export function formatQualified(provider, id) {
  if (!id) return "";
  if (!provider) return id;
  if (id === provider || id.startsWith(`${provider}/`)) return id;
  return `${provider}/${id}`;
}

export function buildSnapshot({ provider, requested, served, servedSource } = {}) {
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

export function shouldShow(snapshot, waiting = false) {
  return Boolean(waiting || snapshot?.served);
}

export function formatLine(snapshot, { waiting = false } = {}) {
  const req = formatQualified(snapshot?.provider, snapshot?.requested);
  if (waiting && !snapshot?.served) {
    return req ? `模型 · 请求 ${req} · 等待响应` : "模型 · 等待响应";
  }
  if (!snapshot?.served) return "";
  if (snapshot.mismatch) return `模型 · 请求 ${req} · 返回 ${snapshot.served}`;
  return `模型 · 返回 ${snapshot.served}`;
}
