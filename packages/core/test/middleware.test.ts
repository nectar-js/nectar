import { describe, expect, test } from "vitest";
import { runChain } from "../src/runtime/index.js";
import type { InteractionContext, Middleware } from "../src/runtime/types.js";

const ctx = (): InteractionContext => ({
  interaction: {} as InteractionContext["interaction"],
  client: {} as InteractionContext["client"],
  route: { id: "command:x", category: "command", path: "x", file: "x" },
  params: {},
  env: "test",
  trace: { id: "1", receivedAt: 0, elapsed: () => 0 },
});

describe("runChain", () => {
  test("runs outer to inner, and code after next() runs after the handler", async () => {
    const log: string[] = [];
    const a: Middleware = async (_c, next) => {
      log.push("a:before");
      await next();
      log.push("a:after");
    };
    const b: Middleware = async (_c, next) => {
      log.push("b:before");
      await next();
      log.push("b:after");
    };
    await runChain([a, b], ctx(), () => {
      log.push("handler");
    });
    expect(log).toEqual(["a:before", "b:before", "handler", "b:after", "a:after"]);
  });

  test("next(extra) extends the downstream context only", async () => {
    const seen: unknown[] = [];
    const a: Middleware = (_c, next) => next({ member: "m" });
    const b: Middleware = (c, next) => {
      seen.push((c as { member?: string }).member);
      return next({ role: "r" });
    };
    const original = ctx();
    await runChain([a, b], original, (c) => {
      seen.push(c);
    });
    expect(seen[0]).toBe("m");
    expect(seen[1]).toMatchObject({ member: "m", role: "r", env: "test" });
    expect(original).not.toHaveProperty("member");
  });

  test("returning without next stops the chain", async () => {
    let ran = false;
    const stop: Middleware = () => "stopped";
    await runChain([stop], ctx(), () => {
      ran = true;
    });
    expect(ran).toBe(false);
  });

  test("throws propagate to the caller", async () => {
    const boom: Middleware = () => {
      throw new Error("nope");
    };
    await expect(runChain([boom], ctx(), () => {})).rejects.toThrow("nope");
    await expect(
      runChain([], ctx(), () => {
        throw new Error("handler");
      }),
    ).rejects.toThrow("handler");
  });

  test("calling next twice is an error", async () => {
    const twice: Middleware = async (_c, next) => {
      await next();
      await next();
    };
    await expect(runChain([twice], ctx(), () => {})).rejects.toThrow("twice");
  });
});
