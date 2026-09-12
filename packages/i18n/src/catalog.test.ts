import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CatalogError, loadCatalogs, placeholdersOf } from "./catalog.js";
import { coverageOf } from "./coverage.js";
import { localizations } from "./meta.js";
import { useLocales } from "./testing.js";

function catalogDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nectar-i18n-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(
      path.join(dir, `${name}.json`),
      typeof contents === "string" ? contents : JSON.stringify(contents),
    );
  }
  return dir;
}

describe("loading", () => {
  test("flattens nested groups to dotted keys", () => {
    const dir = catalogDir({ "en-US": { ban: { done: "Banned.", target: { name: "member" } } } });
    const messages = loadCatalogs(dir).get("en-US")?.messages ?? new Map();
    expect([...messages]).toEqual([
      ["ban.done", "Banned."],
      ["ban.target.name", "member"],
    ]);
  });

  test("treats an object of plural forms as one message", () => {
    const dir = catalogDir({ "en-US": { bans: { one: "{count} ban", other: "{count} bans" } } });
    expect(loadCatalogs(dir).get("en-US")?.messages.get("bans")).toEqual({
      one: "{count} ban",
      other: "{count} bans",
    });
  });

  test("names the key when a message is not a string", () => {
    const dir = catalogDir({ "en-US": { ban: { count: 3 } } });
    expect(() => loadCatalogs(dir)).toThrow(/"ban.count" is number/);
  });

  test("reports a directory with no catalogs", () => {
    expect(() => loadCatalogs(catalogDir({}))).toThrow(CatalogError);
  });

  test("reports invalid JSON with the file that holds it", () => {
    const dir = catalogDir({ fr: "{ nope" });
    expect(() => loadCatalogs(dir)).toThrow(/fr\.json is not valid JSON/);
  });
});

describe("placeholders", () => {
  test("lists the variables a message interpolates", () => {
    expect(placeholdersOf("{user} banned {target}")).toEqual(["target", "user"]);
  });

  test("ignores literal braces", () => {
    expect(placeholdersOf("{{user}}")).toEqual([]);
  });

  test("requires a count on a plural message", () => {
    expect(placeholdersOf({ one: "a ban", other: "bans" })).toEqual(["count"]);
  });
});

describe("coverage", () => {
  test("measures every locale against the fallback", () => {
    const dir = catalogDir({
      "en-US": { hi: "Hi", bye: "Bye" },
      fr: { hi: "Salut", old: "Vieux" },
      klingon: { hi: "nuqneH", bye: "Qapla'" },
    });
    const coverage = coverageOf(loadCatalogs(dir), "en-US");
    expect(coverage.total).toBe(2);
    expect(coverage.locales).toEqual([
      { locale: "en-US", missing: [], extra: [], known: true },
      { locale: "fr", missing: ["bye"], extra: ["old"], known: true },
      { locale: "klingon", missing: [], extra: [], known: false },
    ]);
  });
});

describe("localizations", () => {
  test("leaves out a locale Discord does not know, which would fail registration", () => {
    const dir = catalogDir({ "en-US": { hi: "Hi" }, klingon: { hi: "nuqneH" } });
    useLocales(dir);
    expect(localizations("hi")).toEqual({ "en-US": "Hi" });
  });
});
