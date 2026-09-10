import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { enableModuleReloading, invalidateModuleGraph } from "../src/compiler/load.js";
import { ModuleRegistry } from "../src/runtime/index.js";
import { makeApp } from "./helpers.js";

describe("module reloading", () => {
  // Global for the process, so every test app below lives under the one root.
  beforeAll(() => enableModuleReloading(tmpdir()));

  test("a changed file evaluates again after invalidation, an unchanged one is shared", async () => {
    const root = makeApp({
      "a.ts": 'export const v = "a1";\n',
      "b.ts": 'export const v = "b1";\n',
    });
    const modules = new ModuleRegistry();
    const a = path.join(root, "a.ts");
    const b = path.join(root, "b.ts");
    const [a1, b1] = await Promise.all([modules.load(a), modules.load(b)]);
    expect([a1.v, b1.v]).toEqual(["a1", "b1"]);

    writeFileSync(a, 'export const v = "a2";\n');
    modules.invalidate([a]);
    expect((await modules.load(a)).v).toBe("a2");
    expect(await modules.load(b)).toBe(b1);

    // Same content, so the same URL and the same instance.
    modules.invalidate([b]);
    expect(await modules.load(b)).toBe(b1);
  });

  test("invalidating the graph re-evaluates unchanged files too", async () => {
    const root = makeApp({ "a.ts": 'export const v = "a";\n' });
    const modules = new ModuleRegistry();
    const a = path.join(root, "a.ts");
    const first = await modules.load(a);
    modules.invalidate();
    expect(await modules.load(a)).toBe(first);
    invalidateModuleGraph();
    modules.invalidate();
    expect(await modules.load(a)).not.toBe(first);
  });
});
