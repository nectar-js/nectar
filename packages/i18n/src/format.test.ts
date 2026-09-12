import { describe, expect, test } from "vitest";
import { format } from "./format.js";

describe("interpolation", () => {
  test("fills in variables", () => {
    expect(format("Banned {user}.", "en-US", { user: "spammer" })).toBe("Banned spammer.");
  });

  test("leaves a variable that was not passed, so the gap is visible in the reply", () => {
    expect(format("Banned {user}.", "en-US", {})).toBe("Banned {user}.");
  });

  test("renders a variable that was passed as null as nothing", () => {
    expect(format("Banned {user}.", "en-US", { user: null })).toBe("Banned .");
  });

  test("writes doubled braces as one", () => {
    expect(format("{{user}} is literal, {user} is not", "en-US", { user: "me" })).toBe(
      "{user} is literal, me is not",
    );
  });

  test("formats numbers and dates for the reader", () => {
    expect(format("{n}", "en-US", { n: 1234.5 })).toBe("1,234.5");
    expect(format("{n}", "de", { n: 1234.5 })).toBe("1.234,5");
    expect(format("{at}", "en-US", { at: new Date("2026-03-04T00:00:00Z") })).toContain("2026");
  });
});

describe("plurals", () => {
  const history = {
    "0": "never",
    one: "{count} time",
    other: "{count} times",
  };

  test("prefers an exact count over the category", () => {
    expect(format(history, "en-US", { count: 0 })).toBe("never");
  });

  test("picks the category for the locale", () => {
    expect(format(history, "en-US", { count: 1 })).toBe("1 time");
    expect(format(history, "en-US", { count: 4 })).toBe("4 times");
    // French treats 1 and 0 alike, so the same count reads differently there.
    expect(format({ one: "un", other: "beaucoup" }, "fr", { count: 0 })).toBe("un");
  });

  test("falls back to other when the locale needs a form the catalog lacks", () => {
    expect(format({ other: "{count} times" }, "pl", { count: 3 })).toBe("3 times");
  });

  test("falls back to other without a count", () => {
    expect(format(history, "en-US", {})).toBe("{count} times");
  });
});
