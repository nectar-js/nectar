import { stableStringify } from "../manifest/emit.js";
import { type AnyCommand, commandKey, normalizeCommand } from "./normalize.js";

export interface CommandDiff {
  /** Command names, `type:name` when the type is not chat input. */
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
  hasChanges: boolean;
}

/** Compares what the app wants registered with what Discord currently has. */
export function diffCommands(desired: AnyCommand[], remote: AnyCommand[]): CommandDiff {
  const want = new Map(desired.map((c) => [commandKey(c), stableStringify(normalizeCommand(c))]));
  const have = new Map(remote.map((c) => [commandKey(c), stableStringify(normalizeCommand(c))]));

  const diff: CommandDiff = {
    added: [],
    removed: [],
    changed: [],
    unchanged: [],
    hasChanges: false,
  };
  for (const [key, body] of want) {
    const current = have.get(key);
    if (current === undefined) diff.added.push(label(key));
    else if (current === body) diff.unchanged.push(label(key));
    else diff.changed.push(label(key));
  }
  for (const key of have.keys()) {
    if (!want.has(key)) diff.removed.push(label(key));
  }
  for (const list of [diff.added, diff.removed, diff.changed, diff.unchanged]) list.sort();
  diff.hasChanges = diff.added.length + diff.removed.length + diff.changed.length > 0;
  return diff;
}

function label(key: string): string {
  return key.startsWith("1:") ? key.slice(2) : key;
}
