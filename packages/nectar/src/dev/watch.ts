import { type FSWatcher, watch } from "node:fs";
import path from "node:path";

export interface Watcher {
  close(): void;
}

export interface WatchOptions {
  /** Milliseconds to wait for more events before reporting a batch. Defaults to 80. */
  debounce?: number;
  onError?: (error: Error) => void;
}

/**
 * Watches a directory tree and reports changed paths in debounced batches. Editors write a
 * file in several steps and `fs.watch` reports each one, so a batch collapses them to one
 * change and lets several files saved together be handled together.
 */
export function watchTree(
  root: string,
  onChange: (files: string[]) => void,
  options: WatchOptions = {},
): Watcher {
  const { debounce = 80, onError } = options;
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    timer = null;
    const files = [...pending];
    pending.clear();
    onChange(files);
  };

  const watcher: FSWatcher = watch(root, { recursive: true }, (_event, filename) => {
    if (filename === null) return;
    pending.add(path.join(root, filename.toString()));
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounce);
  });
  if (onError !== undefined) watcher.on("error", onError);

  return {
    close() {
      if (timer !== null) clearTimeout(timer);
      watcher.close();
    },
  };
}
