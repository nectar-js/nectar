import type { Boundary, Route } from "./routes.js";
import type { Segment } from "./segments.js";

export interface RouteChains {
  /** Middleware files from the app root down to the route's directory, in execution order. */
  middleware: string[];
  /** Error boundary files from the route's directory up to the app root, nearest first. */
  errors: string[];
}

/**
 * Picks the boundaries that apply to a route: everything at the app root, plus every
 * boundary in the route's category whose directory is an ancestor of (or equal to) the
 * route's directory. Route groups count as directories here, so a middleware inside
 * `(admin)/` covers only that group.
 */
export function resolveChains(route: Route, boundaries: readonly Boundary[]): RouteChains {
  const applicable = boundaries.filter(
    (b) =>
      (b.category === null || b.category === route.category) &&
      isPrefix(b.segments, route.segments),
  );
  const byDepth = (a: Boundary, b: Boundary) => depth(a) - depth(b);

  return {
    middleware: applicable
      .filter((b) => b.kind === "middleware")
      .sort(byDepth)
      .map((b) => b.file),
    errors: applicable
      .filter((b) => b.kind === "error")
      .sort(byDepth)
      .reverse()
      .map((b) => b.file),
  };
}

/** Root boundaries sit above the category directory, so they sort before category-level ones. */
function depth(boundary: Boundary): number {
  return boundary.category === null ? -1 : boundary.segments.length;
}

function isPrefix(prefix: readonly Segment[], segments: readonly Segment[]): boolean {
  if (prefix.length > segments.length) return false;
  return prefix.every((s, i) => s.type === segments[i]?.type && s.name === segments[i]?.name);
}
