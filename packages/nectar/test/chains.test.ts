import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildGraph, buildRouteTable, resolveChains } from "../src/compiler/index.js";
import { makeApp } from "./helpers.js";

const handler = "export default async function () {}\n";
const cmd = `export const meta = { description: "d" };\n${handler}`;

function chainsFor(files: Record<string, string>) {
  const root = makeApp(files);
  const table = buildRouteTable(root);
  expect(table.diagnostics.items).toEqual([]);
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  return Object.fromEntries(
    table.routes.map((route) => {
      const chains = resolveChains(route, table.boundaries);
      return [
        `${route.kind}:${route.path}`,
        { middleware: chains.middleware.map(rel), errors: chains.errors.map(rel) },
      ];
    }),
  );
}

describe("middleware chains", () => {
  test("run from the app root down to the route, groups included", () => {
    const chains = chainsFor({
      "middleware.ts": handler,
      "commands/middleware.ts": handler,
      "commands/(admin)/middleware.ts": handler,
      "commands/(admin)/mod/middleware.ts": handler,
      "commands/(admin)/mod/ban/command.ts": cmd,
      "commands/(admin)/mod/route.ts": "export const meta = { description: 'd' };\n",
      "commands/ping/command.ts": cmd,
    });
    expect(chains["command:mod/ban"]?.middleware).toEqual([
      "middleware.ts",
      "commands/middleware.ts",
      "commands/(admin)/middleware.ts",
      "commands/(admin)/mod/middleware.ts",
    ]);
    expect(chains["command:ping"]?.middleware).toEqual(["middleware.ts", "commands/middleware.ts"]);
  });

  test("a middleware in a sibling directory or another category does not apply", () => {
    const chains = chainsFor({
      "commands/mod/middleware.ts": handler,
      "commands/ping/command.ts": cmd,
      "components/middleware.ts": handler,
      "components/confirm/button.ts": handler,
      "events/middleware.ts": handler,
      "events/clientReady/event.ts": handler,
    });
    expect(chains["command:ping"]?.middleware).toEqual([]);
    expect(chains["button:confirm"]?.middleware).toEqual(["components/middleware.ts"]);
    expect(chains["event:clientReady"]?.middleware).toEqual(["events/middleware.ts"]);
  });

  test("a static directory does not match a dynamic one with the same name", () => {
    const chains = chainsFor({
      "components/tickets/id/middleware.ts": handler,
      "components/tickets/[id]/button.ts": handler,
    });
    expect(chains["button:tickets/[id]"]?.middleware).toEqual([]);
  });
});

describe("error chains", () => {
  test("nearest boundary first, then up to the root", () => {
    const chains = chainsFor({
      "error.ts": handler,
      "components/error.ts": handler,
      "components/tickets/error.ts": handler,
      "components/tickets/[id]/close/button.ts": handler,
      "commands/ping/command.ts": cmd,
    });
    expect(chains["button:tickets/[id]/close"]?.errors).toEqual([
      "components/tickets/error.ts",
      "components/error.ts",
      "error.ts",
    ]);
    expect(chains["command:ping"]?.errors).toEqual(["error.ts"]);
  });
});

describe("graph", () => {
  test("collects every category and merges diagnostics", async () => {
    const root = makeApp({
      "middleware.ts": handler,
      "commands/ping/command.ts": cmd,
      "components/confirm/button.ts": handler,
      "components/pick/select.ts": handler,
      "events/clientReady/event.ts": handler,
      "events/nope/event.ts": handler,
    });
    const graph = await buildGraph(root);
    expect(graph.commands.map((c) => c.name)).toEqual(["ping"]);
    expect(graph.components.map((c) => c.id)).toEqual(["component:confirm"]);
    expect(graph.events.map((e) => e.name)).toEqual(["clientReady"]);
    expect(graph.autocomplete).toEqual([]);
    expect(graph.diagnostics.items.map((d) => d.code)).toEqual([
      "missing-select-kind",
      "unknown-event",
    ]);
    expect(graph.chains.size).toBe(5);
    for (const chains of graph.chains.values()) {
      expect(chains.middleware).toEqual([path.join(root, "middleware.ts")]);
    }
  });
});
