import { describe, expect, test } from "vitest";
import { matchLocale } from "./locale.js";

describe("matchLocale", () => {
  const available = new Set(["en-US", "pt-BR", "fr"]);

  test("takes an exact catalog", () => {
    expect(matchLocale("fr", available, "en-US")).toBe("fr");
  });

  test("takes the language when the region has no catalog", () => {
    expect(matchLocale("fr-CA", available, "en-US")).toBe("fr");
  });

  test("takes another region of the same language", () => {
    expect(matchLocale("pt", available, "en-US")).toBe("pt-BR");
  });

  test("falls back when nothing matches", () => {
    expect(matchLocale("ja", available, "en-US")).toBe("en-US");
    expect(matchLocale(null, available, "en-US")).toBe("en-US");
  });
});
