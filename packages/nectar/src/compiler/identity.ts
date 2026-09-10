import { createHash } from "node:crypto";

/**
 * Short, stable identifier used inside custom IDs.
 * First 6 base36 characters of the SHA-256 of the canonical route identity.
 */
export function shortId(routeId: string): string {
  const hex = createHash("sha256").update(routeId).digest("hex").slice(0, 16);
  return BigInt(`0x${hex}`).toString(36).padStart(6, "0").slice(0, 6);
}
