import type { Interaction } from "discord.js";
import { describe, expect, test } from "vitest";
import { defineMiddleware, stop, use } from "../src/index.js";
import { runInScope, runMiddleware, type Scope } from "../src/runtime/index.js";
import type { Middleware } from "../src/runtime/types.js";

const interaction = {} as Interaction;

function scope(): Scope {
  return {
    interaction,
    client: {} as Scope["client"],
    env: "test",
    services: {},
    route: { id: "command:x", category: "command", path: "x", file: "x" },
    trace: { id: "1", receivedAt: 0, elapsed: () => 0 },
    results: new Map(),
  };
}

describe("runMiddleware", () => {
  test("runs outer to inner and keeps each result for use()", async () => {
    const log: string[] = [];
    const a = defineMiddleware(async () => {
      log.push("a");
      return { member: "m" };
    });
    const b = defineMiddleware(async () => {
      log.push("b");
      return use(a).member.toUpperCase();
    });
    const s = scope();
    const proceed = await runInScope(s, () => runMiddleware([a, b], interaction, s.results));
    expect(proceed).toBe(true);
    expect(log).toEqual(["a", "b"]);
    expect(s.results.get(a)).toEqual({ member: "m" });
    expect(s.results.get(b)).toBe("M");
  });

  test("stop ends the chain and the handler must not run", async () => {
    const log: string[] = [];
    const first = defineMiddleware(async () => {
      log.push("first");
      return stop;
    });
    const second = defineMiddleware(async () => {
      log.push("second");
    });
    const s = scope();
    const proceed = await runInScope(s, () =>
      runMiddleware([first, second], interaction, s.results),
    );
    expect(proceed).toBe(false);
    expect(log).toEqual(["first"]);
  });

  test("reports each layer before it runs", async () => {
    const entered: number[] = [];
    const layers: Middleware[] = [async () => {}, async () => {}];
    await runMiddleware(layers, interaction, new Map(), (i) => entered.push(i));
    expect(entered).toEqual([0, 1]);
  });

  test("throws propagate to the caller", async () => {
    const boom: Middleware = () => {
      throw new Error("nope");
    };
    await expect(runMiddleware([boom], interaction, new Map())).rejects.toThrow("nope");
  });
});

describe("use", () => {
  test("outside a route, or for a middleware that did not run, it says so", async () => {
    const m = defineMiddleware(async () => 1);
    expect(() => use(m)).toThrow("use() was called outside a route.");
    await expect(runInScope(scope(), async () => use(m))).rejects.toThrow(
      "use() was given a middleware that did not run for command:x.",
    );
  });
});
