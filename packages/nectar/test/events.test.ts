import { describe, expect, test } from "vitest";
import { buildRouteTable } from "../src/compiler/index.js";
import { compileEvents } from "../src/events/index.js";
import { makeApp } from "./helpers.js";

const handler = "export default async function () {}\n";
const withMeta = (meta: string) => `export const meta = ${meta};\n${handler}`;

async function compile(files: Record<string, string>) {
  const root = makeApp(files);
  const table = buildRouteTable(root);
  expect(table.diagnostics.items).toEqual([]);
  const result = await compileEvents(table);
  return {
    events: result.events.map((e) => ({
      name: e.name,
      mode: e.mode,
      handlers: e.handlers.map((h) => [h.route.id, h.once, h.order]),
    })),
    codes: result.diagnostics.items.map((d) => d.code),
    diagnostics: result.diagnostics.items,
  };
}

describe("events", () => {
  test("one handler per event with defaults", async () => {
    const { events, codes } = await compile({
      "events/clientReady/event.ts": handler,
      "events/messageCreate/event.ts": handler,
    });
    expect(codes).toEqual([]);
    expect(events).toEqual([
      { name: "clientReady", mode: "sequential", handlers: [["event:clientReady", false, 0]] },
      { name: "messageCreate", mode: "sequential", handlers: [["event:messageCreate", false, 0]] },
    ]);
  });

  test("groups fan out and sort by order then identity", async () => {
    const { events, codes } = await compile({
      "events/guildMemberAdd/(welcome)/event.ts": withMeta("{ order: 10 }"),
      "events/guildMemberAdd/(audit)/event.ts": withMeta("{ order: -1, once: true }"),
      "events/guildMemberAdd/(metrics)/event.ts": handler,
      "events/guildMemberAdd/(alerts)/event.ts": handler,
    });
    expect(codes).toEqual([]);
    expect(events[0]?.handlers).toEqual([
      ["event:guildMemberAdd/(audit)", true, -1],
      ["event:guildMemberAdd/(alerts)", false, 0],
      ["event:guildMemberAdd/(metrics)", false, 0],
      ["event:guildMemberAdd/(welcome)", false, 10],
    ]);
  });

  test("mode is shared by the event", async () => {
    const { events, codes } = await compile({
      "events/messageCreate/(a)/event.ts": withMeta('{ mode: "concurrent" }'),
      "events/messageCreate/(b)/event.ts": handler,
    });
    expect(codes).toEqual([]);
    expect(events[0]?.mode).toBe("concurrent");
  });

  test("conflicting modes are reported on every file that sets one", async () => {
    const { diagnostics } = await compile({
      "events/messageCreate/(a)/event.ts": withMeta('{ mode: "concurrent" }'),
      "events/messageCreate/(b)/event.ts": withMeta('{ mode: "sequential" }'),
      "events/messageCreate/(c)/event.ts": handler,
    });
    expect(diagnostics.map((d) => [d.code, d.route])).toEqual([
      ["event-mode-conflict", "event:messageCreate/(a)"],
      ["event-mode-conflict", "event:messageCreate/(b)"],
    ]);
  });

  test("unknown event names", async () => {
    const { codes, diagnostics } = await compile({
      "events/ready/event.ts": handler,
      "events/GuildMemberAdd/event.ts": handler,
      "events/nope/event.ts": handler,
    });
    expect(codes).toEqual(["unknown-event", "unknown-event", "unknown-event"]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining('Did you mean "guildMemberAdd"?'),
      expect.stringContaining("`Events` enum"),
      expect.stringContaining('renamed it to "clientReady"'),
    ]);
  });

  test("static segments below the event name are rejected", async () => {
    const { codes, diagnostics } = await compile({
      "events/messageCreate/logging/event.ts": handler,
    });
    expect(codes).toEqual(["event-nested-path"]);
    expect(diagnostics[0]?.message).toContain("(logging)");
  });

  test("invalid meta", async () => {
    const { codes } = await compile({
      "events/messageCreate/(a)/event.ts": withMeta('{ once: "yes" }'),
      "events/messageCreate/(b)/event.ts": withMeta("{ order: Infinity }"),
      "events/messageCreate/(c)/event.ts": withMeta('{ mode: "parallel" }'),
      "events/messageCreate/(d)/event.ts": withMeta("[]"),
    });
    expect(codes).toEqual(["invalid-meta", "invalid-meta", "invalid-meta", "invalid-meta"]);
  });
});
