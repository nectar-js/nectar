import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { catalogs, configure, localeFor, reload } from "./state.js";

function catalogDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nectar-i18n-"));
  writeFileSync(path.join(dir, "en-US.json"), JSON.stringify({ hi: "Hi" }));
  writeFileSync(path.join(dir, "fr.json"), JSON.stringify({ hi: "Salut" }));
  return dir;
}

afterEach(() => {
  configure();
});

describe("which locale a reply follows", () => {
  test("follows the reader by default", () => {
    configure({ dir: catalogDir() });
    expect(localeFor({ locale: "fr", guildLocale: "en-US" })).toBe("fr");
  });

  test("follows the server when asked to", () => {
    configure({ dir: catalogDir(), source: "guild" });
    expect(localeFor({ locale: "fr", guildLocale: "en-US" })).toBe("en-US");
  });

  test("follows the reader in a direct message, which has no server", () => {
    configure({ dir: catalogDir(), source: "guild" });
    expect(localeFor({ locale: "fr", guildLocale: null })).toBe("fr");
  });
});

describe("reload", () => {
  test("picks up an edited catalog, which is what nectar dev needs", () => {
    const dir = catalogDir();
    configure({ dir });
    expect(catalogs().get("fr")?.messages.get("hi")).toBe("Salut");

    writeFileSync(path.join(dir, "fr.json"), JSON.stringify({ hi: "Coucou" }));
    expect(catalogs().get("fr")?.messages.get("hi")).toBe("Salut");
    expect(reload().get("fr")?.messages.get("hi")).toBe("Coucou");
  });
});
