import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { deriveSessionId } from "../utils/sessionManager.js";

// Models that use /zen/v1/messages (claude format)
const MESSAGES_MODELS = new Set(["big-pickle"]);

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  buildUrl(model) {
    const base = "https://opencode.ai";
    return MESSAGES_MODELS.has(model)
      ? `${base}/zen/v1/messages`
      : `${base}/zen/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true) {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "x-opencode-client": "desktop",
      "x-opencode-session": deriveSessionId(credentials?.connectionId || "opencode-public"),
      "Accept": stream ? "text/event-stream" : "application/json"
    };
  }
}
