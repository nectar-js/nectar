import { readdirSync } from "node:fs";
import path from "node:path";

export type FileKind =
  | "command"
  | "autocomplete"
  | "button"
  | "select"
  | "modal"
  | "event"
  | "middleware"
  | "error"
  | "route";

export interface SourceFile {
  kind: FileKind;
  /** Absolute path. */
  file: string;
  /** Directory names from the app root down to the file's directory. */
  dirs: string[];
}

const RESERVED: Record<string, FileKind> = {
  command: "command",
  autocomplete: "autocomplete",
  button: "button",
  select: "select",
  modal: "modal",
  event: "event",
  middleware: "middleware",
  error: "error",
  route: "route",
};

const EXTENSIONS = new Set([".ts", ".js", ".mts", ".mjs"]);

/**
 * Walks the app directory and returns every reserved file, sorted by path.
 * Anything that is not a reserved filename is ordinary application code and is skipped.
 */
export function discover(appDir: string): SourceFile[] {
  const files: SourceFile[] = [];
  walk(path.resolve(appDir), [], files);
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return files;
}

function walk(dir: string, dirs: string[], out: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, [...dirs, entry.name], out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!EXTENSIONS.has(ext)) continue;
    const base = entry.name.slice(0, -ext.length);
    if (base.endsWith(".test") || base.endsWith(".spec")) continue;
    const kind = RESERVED[base];
    if (kind === undefined) continue;
    out.push({ kind, file: full, dirs });
  }
}
