import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { watchTree } from "../src/dev/watch.js";
import { makeApp } from "./helpers.js";

test("reports changed paths in one debounced batch", async () => {
  const root = makeApp({ "a.ts": "1" });
  const batches: string[][] = [];
  const watcher = watchTree(root, (files) => batches.push(files), { debounce: 50 });
  // fs.watch needs a moment to attach on some platforms.
  await new Promise((r) => setTimeout(r, 100));

  writeFileSync(path.join(root, "a.ts"), "2");
  writeFileSync(path.join(root, "a.ts"), "3");
  mkdirSync(path.join(root, "sub"));
  writeFileSync(path.join(root, "sub", "b.ts"), "1");

  await vi.waitFor(() => expect(batches.length).toBe(1), { timeout: 3000 });
  const [files] = batches;
  expect(files).toContain(path.join(root, "a.ts"));
  expect(files).toContain(path.join(root, "sub", "b.ts"));
  expect(new Set(files).size).toBe(files?.length);
  watcher.close();
});
