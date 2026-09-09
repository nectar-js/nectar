/** Discord rejects custom IDs longer than this. */
export const MAX_CUSTOM_ID_LENGTH = 100;

const PREFIX = "n:";
const SHORT_ID_LENGTH = 6;

/** Characters a route with no parameters uses: the prefix and the short ID. */
export const BASE_OVERHEAD = PREFIX.length + SHORT_ID_LENGTH;

export class CustomIdTooLongError extends Error {
  constructor(
    readonly customId: string,
    readonly routeId: string,
  ) {
    super(
      `Custom ID for ${routeId} is ${customId.length} characters, Discord allows ${MAX_CUSTOM_ID_LENGTH}. Encode a shorter identifier instead of the full value.`,
    );
    this.name = "CustomIdTooLongError";
  }
}

/**
 * Builds `n:<shortId>:<v1>:<v2>...`. Values are escaped so they may contain `:` and `\`.
 * Throws when the result is longer than Discord allows; it never truncates.
 */
export function encodeCustomId(shortId: string, values: readonly string[], routeId = shortId) {
  let out = PREFIX + shortId;
  for (const value of values) out += `:${escapeValue(value)}`;
  if (out.length > MAX_CUSTOM_ID_LENGTH) throw new CustomIdTooLongError(out, routeId);
  return out;
}

export type DecodedCustomId =
  | { ok: true; shortId: string; values: string[] }
  | { ok: false; reason: "not-neat" | "malformed" };

/**
 * Splits a raw custom ID back into its short ID and positional values.
 * IDs without the Neat prefix are reported as `not-neat` so hand-built components pass through.
 */
export function decodeCustomId(raw: string): DecodedCustomId {
  if (!raw.startsWith(PREFIX)) return { ok: false, reason: "not-neat" };

  const shortId = raw.slice(PREFIX.length, PREFIX.length + SHORT_ID_LENGTH);
  if (!/^[0-9a-z]{6}$/.test(shortId)) return { ok: false, reason: "malformed" };

  const values: string[] = [];
  let index = PREFIX.length + SHORT_ID_LENGTH;
  if (index === raw.length) return { ok: true, shortId, values };
  if (raw[index] !== ":") return { ok: false, reason: "malformed" };
  index++;

  let current = "";
  while (index < raw.length) {
    const char = raw[index] as string;
    if (char === "\\") {
      const next = raw[index + 1];
      if (next !== "\\" && next !== ":") return { ok: false, reason: "malformed" };
      current += next;
      index += 2;
      continue;
    }
    if (char === ":") {
      values.push(current);
      current = "";
      index++;
      continue;
    }
    current += char;
    index++;
  }
  values.push(current);
  return { ok: true, shortId, values };
}

function escapeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}
