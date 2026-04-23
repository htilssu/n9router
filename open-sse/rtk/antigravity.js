/**
 * Gemini-format RTK compressor for the MITM token-swap path.
 *
 * Antigravity IDE sends ALL conversation turns as:
 *   { role: "user"|"model"|"tool", parts: [{ text: "..." }] }
 *
 * Tool results are embedded as plain text in "user" turns — there are no
 * functionResponse objects. We compress text in all non-"model" turns and
 * let autoDetectFilter skip short/plain messages naturally.
 *
 * This file is intentionally separate from rtk/index.js so the upstream
 * module stays unmodified.
 */

import { autoDetectFilter } from "./autodetect.js";
import { safeApply } from "./applyFilter.js";
import { isRtkEnabled } from "./flag.js";
import { MIN_COMPRESS_SIZE, RAW_CAP } from "./constants.js";

function compressText(text, stats, shape) {
  const bytesIn = text.length;
  stats.bytesBefore += bytesIn;

  if (bytesIn < MIN_COMPRESS_SIZE || bytesIn > RAW_CAP) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  const fn = autoDetectFilter(text);
  if (!fn) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  const out = safeApply(fn, text);

  if (!out || out.length === 0 || out.length >= bytesIn) {
    stats.bytesAfter += bytesIn;
    return text;
  }

  stats.bytesAfter += out.length;
  stats.hits.push({ shape, filter: fn.filterName || fn.name, saved: bytesIn - out.length });
  return out;
}

/**
 * Compress tool outputs in a Gemini-format body in-place.
 * @param {object} body  - { contents: [...], ... } (the `request` sub-object)
 * @returns {object|null} stats { bytesBefore, bytesAfter, hits } or null if disabled
 */
export function compressContents(body) {
  if (!isRtkEnabled()) return null;
  if (!body || !Array.isArray(body.contents)) return null;

  const stats = { bytesBefore: 0, bytesAfter: 0, hits: [] };
  try {
    for (const turn of body.contents) {
      if (!Array.isArray(turn.parts)) continue;
      // Skip model responses — only compress user/tool turns
      if (turn.role === "model") continue;

      for (const part of turn.parts) {
        // Shape A: structured functionResponse { name, response: { key: "text" } }
        if (part.functionResponse) {
          const resp = part.functionResponse.response;
          if (resp && typeof resp === "object") {
            for (const key of Object.keys(resp)) {
              if (typeof resp[key] === "string") {
                resp[key] = compressText(resp[key], stats, `gemini-fn-${key}`);
              }
            }
          }
          continue;
        }
        // Shape B: plain text part (Antigravity's actual format)
        if (typeof part.text === "string") {
          part.text = compressText(part.text, stats, `gemini-${turn.role}-text`);
        }
      }
    }
  } catch (e) {
    console.warn("[RTK/gemini] compressContents error:", e.message);
    return null;
  }
  return stats;
}
