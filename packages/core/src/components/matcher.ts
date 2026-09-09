import type { ComponentKind, ComponentRoute } from "./compile.js";
import { decodeCustomId } from "./customId.js";

export type MatchResult =
  | { ok: true; route: ComponentRoute; params: Record<string, string | string[]> }
  /** The custom ID is not Neat's. Hand-built components should be left alone. */
  | { ok: false; reason: "not-neat" }
  /** The ID carries the Neat prefix but cannot be decoded, names no route, or has the wrong number of values. */
  | { ok: false; reason: "malformed" | "unknown-route" | "param-count" };

export interface ComponentMatcher {
  match(kind: ComponentKind, customId: string): MatchResult;
}

/**
 * Resolves incoming custom IDs to compiled routes.
 *
 * Custom IDs carry the route's short ID, so matching is a direct lookup rather than a pattern
 * scan. The interaction kind is part of the key because a button and a modal may share a path.
 */
export function createMatcher(routes: readonly ComponentRoute[]): ComponentMatcher {
  const byId = new Map<string, ComponentRoute>();
  for (const route of routes) byId.set(`${route.kind}:${route.shortId}`, route);

  return {
    match(kind, customId) {
      const decoded = decodeCustomId(customId);
      if (!decoded.ok) return decoded;

      const route = byId.get(`${kind}:${decoded.shortId}`);
      if (route === undefined) return { ok: false, reason: "unknown-route" };

      const fixed = route.catchAll === null ? route.params.length : route.params.length - 1;
      if (
        route.catchAll === null ? decoded.values.length !== fixed : decoded.values.length < fixed
      ) {
        return { ok: false, reason: "param-count" };
      }

      const params: Record<string, string | string[]> = {};
      for (let i = 0; i < fixed; i++)
        params[route.params[i] as string] = decoded.values[i] as string;
      if (route.catchAll !== null) params[route.catchAll] = decoded.values.slice(fixed);
      return { ok: true, route, params };
    },
  };
}
