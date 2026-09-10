import { describe, expect, test } from "vitest";
import {
  CustomIdTooLongError,
  decodeCustomId,
  encodeCustomId,
  MAX_CUSTOM_ID_LENGTH,
} from "../src/components/customId.js";

const id = "abc123";
const BS = "\\";

describe("encode", () => {
  test("no params", () => {
    expect(encodeCustomId(id, [])).toBe("n:abc123");
  });

  test("positional params", () => {
    expect(encodeCustomId(id, ["42", "next"])).toBe("n:abc123:42:next");
  });

  test("escapes separators and backslashes", () => {
    expect(encodeCustomId(id, ["a:b", `c${BS}d`, ""])).toBe(`n:abc123:a${BS}:b:c${BS}${BS}d:`);
  });

  test("throws instead of truncating", () => {
    const value = "x".repeat(MAX_CUSTOM_ID_LENGTH - 9);
    expect(encodeCustomId(id, [value])).toHaveLength(MAX_CUSTOM_ID_LENGTH);
    expect(() => encodeCustomId(id, [`${value}x`], "component:a")).toThrow(CustomIdTooLongError);
    expect(() => encodeCustomId(id, [`${value}x`], "component:a")).toThrow(/component:a/);
  });
});

describe("decode", () => {
  test("no params", () => {
    expect(decodeCustomId("n:abc123")).toEqual({ ok: true, shortId: id, values: [] });
  });

  test("params with escapes and empty values", () => {
    expect(decodeCustomId(`n:abc123:a${BS}:b:c${BS}${BS}d:`)).toEqual({
      ok: true,
      shortId: id,
      values: ["a:b", `c${BS}d`, ""],
    });
  });

  test("ignores IDs that are not Nectar's", () => {
    for (const raw of ["", "confirm", "x:abc123", "N:abc123", "n"]) {
      expect(decodeCustomId(raw)).toEqual({ ok: false, reason: "not-nectar" });
    }
  });

  test("rejects malformed IDs without throwing", () => {
    const malformed = [
      "n:",
      "n:abc",
      "n:ABC123",
      "n:abc123x",
      `n:abc123:a${BS}`,
      `n:abc123:${BS}x`,
    ];
    for (const raw of malformed) {
      expect(decodeCustomId(raw)).toEqual({ ok: false, reason: "malformed" });
    }
  });
});

describe("round trip", () => {
  test("random values survive encode and decode", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const alphabet = ["a", "Z", "9", ":", BS, "-", " ", "é", `${BS}:`, "::", `${BS}${BS}`];
    const randomValue = () => {
      const length = Math.floor(random() * 6);
      let value = "";
      for (let i = 0; i < length; i++)
        value += alphabet[Math.floor(random() * alphabet.length)] as string;
      return value;
    };

    for (let run = 0; run < 2000; run++) {
      const count = Math.floor(random() * 5);
      const values = Array.from({ length: count }, randomValue);
      const encoded = encodeCustomId(id, values);
      expect(decodeCustomId(encoded)).toEqual({ ok: true, shortId: id, values });
    }
  });
});
