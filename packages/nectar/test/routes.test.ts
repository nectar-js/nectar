import { describe, expect, test } from "vitest";
import { buildRouteTable, discover, shortId } from "../src/compiler/index.js";
import { makeApp, normalize } from "./helpers.js";

function build(files: Record<string, string> | string[]) {
  const root = makeApp(files);
  return normalize(buildRouteTable(root), root);
}

function codes(files: string[]): string[] {
  return build(files).diagnostics.map((d) => d.code);
}

describe("discovery", () => {
  test("ignores non-reserved files, dotfiles, tests, and node_modules", () => {
    const root = makeApp([
      "commands/ping/command.ts",
      "commands/ping/helpers.ts",
      "commands/ping/command.test.ts",
      "commands/ping/README.md",
      "lib/db.ts",
      ".hidden/command.ts",
      "node_modules/x/command.ts",
    ]);
    expect(discover(root).map((f) => f.kind)).toEqual(["command"]);
  });

  test("accepts js, mts, and mjs handlers", () => {
    const root = makeApp([
      "commands/a/command.js",
      "commands/b/command.mts",
      "commands/c/command.mjs",
    ]);
    expect(discover(root)).toHaveLength(3);
  });

  test("is deterministic across runs", () => {
    const root = makeApp([
      "commands/zeta/command.ts",
      "commands/alpha/command.ts",
      "components/b/[id]/button.ts",
      "components/a/button.ts",
      "events/ready/event.ts",
    ]);
    const first = normalize(buildRouteTable(root), root);
    const second = normalize(buildRouteTable(root), root);
    expect(first).toEqual(second);
    expect(first.routes.map((r) => r.id)).toEqual([
      "command:alpha",
      "command:zeta",
      "component:a",
      "component:b/[id]",
      "event:ready",
    ]);
  });
});

describe("segments and paths", () => {
  test("static and nested command paths", () => {
    const { routes } = build(["commands/ping/command.ts", "commands/mod/ban/command.ts"]);
    expect(routes.map((r) => r.id)).toEqual(["command:mod/ban", "command:ping"]);
    expect(routes[0]?.params).toEqual([]);
  });

  test("dynamic and catch-all segments become params in order", () => {
    const { routes, diagnostics } = build([
      "components/tickets/[ticketId]/close/button.ts",
      "components/files/[folder]/[...rest]/select.ts",
    ]);
    expect(diagnostics).toEqual([]);
    expect(routes.map((r) => [r.path, r.params])).toEqual([
      ["files/[folder]/[...rest]", ["folder", "rest"]],
      ["tickets/[ticketId]/close", ["ticketId"]],
    ]);
  });

  test("route groups do not affect command or component paths", () => {
    const { routes } = build([
      "commands/(admin)/ban/command.ts",
      "components/(tickets)/close/[id]/button.ts",
    ]);
    expect(routes.map((r) => r.id)).toEqual(["command:ban", "component:close/[id]"]);
    expect(routes[0]?.segments).toEqual([
      { type: "group", name: "admin" },
      { type: "static", name: "ban" },
    ]);
  });

  test("route groups keep event handlers distinct", () => {
    const { routes, diagnostics } = build([
      "events/guildMemberAdd/(welcome)/event.ts",
      "events/guildMemberAdd/(audit)/event.ts",
    ]);
    expect(diagnostics).toEqual([]);
    expect(routes.map((r) => r.id)).toEqual([
      "event:guildMemberAdd/(audit)",
      "event:guildMemberAdd/(welcome)",
    ]);
  });

  test("autocomplete shares the command path", () => {
    const { routes } = build(["commands/user/command.ts", "commands/user/autocomplete.ts"]);
    expect(routes.map((r) => [r.kind, r.id])).toEqual([
      ["autocomplete", "command:user"],
      ["command", "command:user"],
    ]);
  });
});

describe("boundaries", () => {
  test("root and scoped middleware, error, and route files", () => {
    const { boundaries, diagnostics } = build([
      "middleware.ts",
      "error.ts",
      "commands/middleware.ts",
      "commands/mod/middleware.ts",
      "commands/mod/route.ts",
      "components/(group)/error.ts",
    ]);
    expect(diagnostics).toEqual([]);
    expect(boundaries.map((b) => [b.kind, b.category, b.segments.map((s) => s.name)])).toEqual([
      ["middleware", "command", []],
      ["middleware", "command", ["mod"]],
      ["route", "command", ["mod"]],
      ["error", "component", ["group"]],
      ["error", null, []],
      ["middleware", null, []],
    ]);
  });
});

describe("diagnostics", () => {
  test("handler at the app root", () => {
    expect(codes(["command.ts"])).toEqual(["file-outside-category"]);
  });

  test("unknown top-level directory", () => {
    expect(codes(["handlers/ping/command.ts"])).toEqual(["unknown-category"]);
  });

  test("handler in the wrong category", () => {
    expect(
      codes(["commands/ping/button.ts", "components/x/command.ts", "events/ready/modal.ts"]),
    ).toEqual(["file-in-wrong-category", "file-in-wrong-category", "file-in-wrong-category"]);
  });

  test("handler directly inside a category directory", () => {
    expect(codes(["commands/command.ts", "events/event.ts"])).toEqual([
      "route-without-path",
      "route-without-path",
    ]);
  });

  test("handler only inside groups", () => {
    expect(codes(["commands/(a)/(b)/command.ts"])).toEqual(["route-without-path"]);
  });

  test("invalid segment names reference the file", () => {
    const { diagnostics } = build(["commands/[bad/command.ts"]);
    expect(diagnostics).toEqual([
      {
        code: "invalid-segment",
        severity: "error",
        message: expect.stringContaining("[bad"),
        file: "commands/[bad/command.ts",
      },
    ]);
  });

  test("dynamic segments outside components", () => {
    expect(codes(["commands/[id]/command.ts", "events/[name]/event.ts"])).toEqual([
      "dynamic-segment-not-allowed",
      "dynamic-segment-not-allowed",
    ]);
  });

  test("catch-all must be last", () => {
    expect(codes(["components/[...rest]/close/button.ts"])).toEqual(["catch-all-not-last"]);
  });

  test("duplicate parameter names", () => {
    expect(codes(["components/[id]/x/[id]/button.ts"])).toEqual(["duplicate-param"]);
  });

  test("duplicate routes through groups", () => {
    const { diagnostics } = build(["commands/ping/command.ts", "commands/(other)/ping/command.ts"]);
    expect(diagnostics).toEqual([
      {
        code: "duplicate-route",
        severity: "error",
        message: expect.stringContaining("command:ping"),
        file: "commands/ping/command.ts",
        route: "command:ping",
      },
    ]);
  });

  test("a component directory holds one handler", () => {
    const { diagnostics } = build(["components/x/button.ts", "components/x/modal.ts"]);
    expect(diagnostics).toEqual([
      {
        code: "duplicate-route",
        severity: "error",
        message: expect.stringContaining("Move one into its own directory."),
        file: "components/x/modal.ts",
        route: "component:x",
      },
    ]);
  });
});

describe("identity", () => {
  test("short ids are stable and six characters", () => {
    expect(shortId("component:tickets/[ticketId]/close")).toMatch(/^[0-9a-z]{6}$/);
    expect(shortId("component:tickets/[ticketId]/close")).toBe(
      shortId("component:tickets/[ticketId]/close"),
    );
    expect(shortId("command:ping")).not.toBe(shortId("command:pong"));
  });

  test("route id depends on the path, not the file location", () => {
    const a = build(["commands/ping/command.ts"]).routes[0];
    const b = build(["commands/(grouped)/ping/command.ts"]).routes[0];
    expect(a?.shortId).toBe(b?.shortId);
  });
});
