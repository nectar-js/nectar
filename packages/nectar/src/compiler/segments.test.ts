import { describe, expect, test } from "vitest";
import { formatSegment, parseSegment } from "./segments.js";

describe("parseSegment", () => {
  test.each([
    ["ping", { type: "static", name: "ping" }],
    ["guild-member", { type: "static", name: "guild-member" }],
    ["guildMemberAdd", { type: "static", name: "guildMemberAdd" }],
    ["[ticketId]", { type: "dynamic", name: "ticketId" }],
    ["[...rest]", { type: "catchAll", name: "rest" }],
    ["(welcome)", { type: "group", name: "welcome" }],
  ])("%s", (input, expected) => {
    const result = parseSegment(input);
    expect(result).toEqual({ ok: true, segment: expected });
    if (result.ok) expect(formatSegment(result.segment)).toBe(input);
  });

  test.each([
    "[ticketId",
    "ticketId]",
    "[]",
    "[...]",
    "[1abc]",
    "[a-b]",
    "(welcome",
    "welcome)",
    "()",
    "-ping",
    "pi ng",
    "ping:x",
    "",
  ])("rejects %j", (input) => {
    const result = parseSegment(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(input === "" ? "can't be part" : input);
  });
});
