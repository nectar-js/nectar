export type Segment =
  | { type: "static"; name: string }
  | { type: "dynamic"; name: string }
  | { type: "catchAll"; name: string }
  | { type: "group"; name: string };

export type SegmentParseResult = { ok: true; segment: Segment } | { ok: false; reason: string };

const STATIC_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parses one directory name into a route segment.
 *
 * `name`      static
 * `[name]`    dynamic
 * `[...name]` catch-all
 * `(name)`    group, organizational only
 */
export function parseSegment(dirName: string): SegmentParseResult {
  if (dirName.startsWith("[") || dirName.endsWith("]")) {
    if (!dirName.startsWith("[") || !dirName.endsWith("]")) {
      return fail(`"${dirName}" has an unmatched bracket. Parameters look like [name].`);
    }
    const inner = dirName.slice(1, -1);
    const isCatchAll = inner.startsWith("...");
    const name = isCatchAll ? inner.slice(3) : inner;
    if (!PARAM_NAME.test(name)) {
      return fail(
        `"${dirName}" has an invalid parameter name. Parameters become keys of ctx.params, so use letters, digits, and underscores, and don't start with a digit.`,
      );
    }
    return ok({ type: isCatchAll ? "catchAll" : "dynamic", name });
  }

  if (dirName.startsWith("(") || dirName.endsWith(")")) {
    if (!dirName.startsWith("(") || !dirName.endsWith(")")) {
      return fail(`"${dirName}" has an unmatched parenthesis. Route groups look like (name).`);
    }
    const name = dirName.slice(1, -1);
    if (!STATIC_NAME.test(name)) {
      return fail(
        `"${dirName}" isn't a valid group name. Use letters, digits, hyphens, and underscores.`,
      );
    }
    return ok({ type: "group", name });
  }

  if (!STATIC_NAME.test(dirName)) {
    return fail(
      `"${dirName}" can't be part of a route path. Use letters, digits, hyphens, and underscores, and start with a letter or digit.`,
    );
  }
  return ok({ type: "static", name: dirName });
}

/** Renders a segment back into its directory form. Groups render as their directory name. */
export function formatSegment(segment: Segment): string {
  switch (segment.type) {
    case "static":
      return segment.name;
    case "dynamic":
      return `[${segment.name}]`;
    case "catchAll":
      return `[...${segment.name}]`;
    case "group":
      return `(${segment.name})`;
  }
}

function ok(segment: Segment): SegmentParseResult {
  return { ok: true, segment };
}

function fail(reason: string): SegmentParseResult {
  return { ok: false, reason };
}
