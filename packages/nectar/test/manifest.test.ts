import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { buildGraph } from "../src/compiler/index.js";
import {
  loadManifest,
  ManifestVersionError,
  stableStringify,
  toManifest,
  writeManifest,
} from "../src/manifest/index.js";

const appDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../examples/basic/app",
);
const outDir = path.resolve(appDir, "../.nectar");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nectar-manifest-"));
  temps.push(dir);
  return dir;
}

describe("manifest", () => {
  test("examples/basic manifest", async () => {
    const graph = await buildGraph(appDir);
    expect(graph.diagnostics.items).toEqual([]);
    const manifest = toManifest(graph, outDir);
    expect(manifest.appDir).toBe("../app");
    expect(manifest).toMatchSnapshot();
  });

  test("emission is byte-identical across runs and independent of key order", async () => {
    const graph = await buildGraph(appDir);
    const a = stableStringify(toManifest(graph, outDir));
    const b = stableStringify(toManifest(await buildGraph(appDir), outDir));
    expect(a).toBe(b);
    expect(stableStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 2 } })).toBe(
      stableStringify({ a: { c: 2, d: [{ y: 2, z: 1 }] }, b: 1 }),
    );
  });

  test("write then load resolves the app directory", async () => {
    const dir = temp();
    const out = path.join(dir, ".nectar");
    const graph = await buildGraph(appDir);
    const file = writeManifest(toManifest(graph, out), out);
    expect(path.basename(file)).toBe("manifest.json");
    expect(readFileSync(file, "utf8").endsWith("}\n")).toBe(true);

    const loaded = loadManifest(file);
    expect(loaded.appDir).toBe(appDir);
    expect(loaded.manifest.routes.length).toBe(graph.routes.length);
  });

  test("rejects other manifest versions", () => {
    const dir = temp();
    const file = path.join(dir, "manifest.json");
    writeFileSync(file, JSON.stringify({ version: 2, appDir: "../app" }));
    expect(() => loadManifest(file)).toThrow(ManifestVersionError);
    expect(() => loadManifest(file)).toThrow(/version 2/);
    writeFileSync(file, "[]");
    expect(() => loadManifest(file)).toThrow(/not a manifest/);
  });
});
