import { afterEach, describe, expect, test, vi } from "vitest";
import { ConfigError, validateConfig } from "../src/config.js";
import { consoleSink, createLogger, type LogRecord } from "../src/runtime/index.js";
import { redactCustomId } from "../src/runtime/signals.js";

describe("logger", () => {
  test("drops records below the level and hands the rest to the sink", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "warn", sink: (r) => records.push(r) });
    logger.debug("d");
    logger.info("i", { route: "command:ping" });
    logger.warn("w", { route: "command:ping" });
    logger.error("e", { error: new Error("x") });
    expect(records.map((r) => [r.level, r.message])).toEqual([
      ["warn", "w"],
      ["error", "e"],
    ]);
    expect(records[0]?.fields).toEqual({ route: "command:ping" });
    expect(records[1]?.fields.error).toMatchObject({ message: "x" });
    expect(records.every((r) => typeof r.at === "number")).toBe(true);
  });

  test("defaults to info", () => {
    const sink = vi.fn();
    const logger = createLogger({ sink });
    logger.debug("d");
    logger.info("i");
    expect(sink).toHaveBeenCalledTimes(1);
  });

  describe("console sink", () => {
    afterEach(() => vi.restoreAllMocks());

    test("prints one line with fields, and the error as a second argument", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const thrown = new Error("x");
      consoleSink({
        level: "warn",
        message: "Slow",
        at: 0,
        fields: { route: "command:ping", guild: null, duration: 12 },
      });
      consoleSink({ level: "error", message: "Failed", at: 0, fields: { error: thrown } });
      expect(warn).toHaveBeenCalledWith("[nectar] Slow route=command:ping duration=12");
      expect(error).toHaveBeenCalledWith("[nectar] Failed", thrown);
    });
  });
});

describe("redaction", () => {
  test("hides Nectar param values and leaves foreign IDs alone", () => {
    expect(redactCustomId("n:abc123")).toBe("n:abc123");
    expect(redactCustomId("n:abc123:secret:more")).toBe("n:abc123:*");
    expect(redactCustomId("n:abc123:a\\:b")).toBe("n:abc123:*");
    expect(redactCustomId("my-button")).toBe("my-button");
  });
});

describe("config", () => {
  const check = (value: unknown) => () => validateConfig(value, "nectar.config.ts");

  test("accepts logger and observe", () => {
    expect(
      check({ intents: [], logger: { level: "debug", sink: () => {} }, observe: () => {} }),
    ).not.toThrow();
  });

  test("rejects bad logger and observe values", () => {
    expect(check({ intents: [], logger: { level: "loud" } })).toThrow(ConfigError);
    expect(check({ intents: [], logger: { sink: "stdout" } })).toThrow(/logger\.sink/);
    expect(check({ intents: [], logger: "verbose" })).toThrow(/`logger`/);
    expect(check({ intents: [], observe: true })).toThrow(/observe/);
  });
});
