import { describe, expect, test } from "vitest";
import { findInvalidParam, paramValidatorsOf } from "../src/components/index.js";
import { defineComponent } from "../src/define.js";

const schema = (ok: boolean, async = false) => ({
  "~standard": {
    validate: (value: unknown) => {
      const result = ok ? { value } : { issues: [{ message: "bad" }] };
      return async ? Promise.resolve(result) : result;
    },
  },
});

describe("paramValidatorsOf", () => {
  const route = { params: ["ticketId", "action"] };

  test("reads what defineComponent attached and accepts functions and schemas", () => {
    // The route comes from the augmentation in types.test.ts, which types `v` as a string.
    const handler = defineComponent("tickets/[ticketId]/close", async () => {}, {
      params: { ticketId: (v) => v.length > 0 },
    });
    expect(Object.keys(paramValidatorsOf(handler, { params: ["ticketId"] }))).toEqual(["ticketId"]);
    const both = Object.assign(async () => {}, {
      params: { ticketId: () => true, action: schema(true) },
    });
    expect(Object.keys(paramValidatorsOf(both, route))).toEqual(["ticketId", "action"]);
    expect(paramValidatorsOf(async () => {}, route)).toEqual({});
  });

  test("rejects unknown parameters and non-validators", () => {
    const bad = (params: unknown) => Object.assign(async () => {}, { params });
    expect(() => paramValidatorsOf(bad({ nope: () => true }), route)).toThrow(
      'validates "nope", which is not a parameter of this route. It has: ticketId, action.',
    );
    expect(() => paramValidatorsOf(bad({ ticketId: /x/ }), route)).toThrow(
      "`params.ticketId` must be a function or a Standard Schema, got object.",
    );
    expect(() => paramValidatorsOf(bad([]), route)).toThrow("must be an object");
    expect(() => paramValidatorsOf(bad({ x: () => true }), { params: [] })).toThrow("It has none.");
  });
});

describe("findInvalidParam", () => {
  test("functions fail by returning false or throwing", async () => {
    const params = { a: "1", b: "2" };
    expect(await findInvalidParam({ a: () => true, b: () => undefined }, params)).toBeNull();
    expect(await findInvalidParam({ a: () => true, b: () => false }, params)).toBe("b");
    expect(
      await findInvalidParam(
        {
          a: () => {
            throw new Error("no");
          },
        },
        params,
      ),
    ).toBe("a");
    expect(await findInvalidParam({ a: async () => false }, params)).toBe("a");
  });

  test("schemas fail by reporting issues, sync or async", async () => {
    expect(await findInvalidParam({ a: schema(true) }, { a: "1" })).toBeNull();
    expect(await findInvalidParam({ a: schema(false) }, { a: "1" })).toBe("a");
    expect(await findInvalidParam({ a: schema(false, true) }, { a: "1" })).toBe("a");
  });

  test("a missing value fails, and catch-all values arrive as arrays", async () => {
    expect(await findInvalidParam({ a: () => true }, {})).toBe("a");
    expect(
      await findInvalidParam(
        { rest: (v) => Array.isArray(v) && v.length === 2 },
        { rest: ["x", "y"] },
      ),
    ).toBeNull();
  });
});
