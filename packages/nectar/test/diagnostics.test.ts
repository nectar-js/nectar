import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DIAGNOSTIC_CODES, docsUrl } from "../src/compiler/diagnostics.js";

test("the diagnostics reference has an entry for every code and nothing else", () => {
  const page = readFileSync(
    new URL("../../../docs/reference/diagnostics.md", import.meta.url),
    "utf8",
  );
  const entries = [...page.matchAll(/^### (\S+)$/gm)].map((match) => match[1]);
  expect(entries.sort()).toEqual([...DIAGNOSTIC_CODES].sort());
});

test("only compiler codes link to the reference", () => {
  expect(docsUrl("duplicate-route")).toBe(
    "https://nectar-js.github.io/nectar/reference/diagnostics#duplicate-route",
  );
  expect(docsUrl("usage-empty")).toBeUndefined();
});
