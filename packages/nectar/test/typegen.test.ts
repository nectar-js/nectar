import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildGraph } from "../src/compiler/index.js";
import { encodeComponentRoute, registerComponentRoutes } from "../src/components/index.js";
import { ConfigError, validateConfig } from "../src/config.js";
import { toTypes, writeTypes } from "../src/typegen/index.js";
import { makeApp } from "./helpers.js";

const basic = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/basic");
const appDir = path.join(basic, "app");

describe("generated types", () => {
  test("examples/basic types.d.ts", async () => {
    const graph = await buildGraph(appDir);
    expect(graph.diagnostics.items).toEqual([]);
    const types = toTypes(graph, path.join(basic, ".nectar"));
    expect(types).toMatchSnapshot();

    // The example project's typecheck reads this file, so the checkpoint runs against real output.
    const file = writeTypes(graph, path.join(basic, ".nectar"));
    expect(readFileSync(file, "utf8")).toBe(types);
  });

  test("catch-all params and middleware aliases", async () => {
    const root = makeApp({
      "middleware.ts": "export default async function (ctx, next) { return next(); }\n",
      "components/w/[id]/[...steps]/modal.ts": "export default async function () {}\n",
      "components/w/middleware.ts":
        "export default async function (ctx, next) { return next(); }\n",
    });
    const types = toTypes(await buildGraph(root), path.join(root, ".nectar"));
    expect(types).toContain(
      '"w/[id]/[...steps]": { kind: "modal"; params: { "id": string; "steps": string[] }; context: M0 & M1 };',
    );
    expect(types).toContain('type M0 = MiddlewareExtension<typeof import("../middleware.js")>;');
    expect(types).toContain(
      'type M1 = MiddlewareExtension<typeof import("../components/w/middleware.js")>;',
    );
  });
});

describe("declared routes", () => {
  const define = (route: string, extra = "") =>
    `${extra}export default Object.assign(async function () {}, { route: "${route}" });\n`;

  test("a handler that names its own route passes", async () => {
    const root = makeApp({
      "commands/ping/command.ts": define("ping", 'export const meta = { description: "d" };\n'),
      "components/tickets/[id]/button.ts": define("tickets/[id]"),
      "events/clientReady/(a)/event.ts": define("clientReady"),
    });
    const graph = await buildGraph(root);
    expect(graph.diagnostics.items).toEqual([]);
  });

  test("a handler that names another route is rejected", async () => {
    const root = makeApp({
      "commands/ping/command.ts": define("pong", 'export const meta = { description: "d" };\n'),
      "components/tickets/[id]/button.ts": define("tickets/[ticketId]"),
      "events/clientReady/event.ts": define("ready"),
    });
    const graph = await buildGraph(root);
    expect(graph.diagnostics.items.map((d) => [d.code, d.route])).toEqual([
      ["route-mismatch", "command:ping"],
      ["route-mismatch", "component:tickets/[id]"],
      ["route-mismatch", "event:clientReady"],
    ]);
    expect(graph.diagnostics.items[0]?.message).toContain('says "pong"');
  });

  test("a route file without a function as its default export is rejected", async () => {
    const root = makeApp({
      "commands/ping/command.ts": 'export const meta = { description: "d" };\n',
      "components/tickets/[id]/button.ts": "export default 1;\n",
      "events/clientReady/event.ts": "export const once = true;\n",
    });
    const graph = await buildGraph(root);
    expect(graph.diagnostics.items.map((d) => [d.code, d.route])).toEqual([
      ["missing-handler", "command:ping"],
      ["missing-handler", "component:tickets/[id]"],
      ["missing-handler", "event:clientReady"],
    ]);
    expect(graph.diagnostics.items[1]?.message).toContain("exports a number as its default");
  });
});

describe("customId registry", () => {
  test("encodes registered routes and rejects unknown ones", () => {
    registerComponentRoutes([]);
    expect(() => encodeComponentRoute("x", {})).toThrow(/before the runtime registered/);

    registerComponentRoutes([
      {
        path: "tickets/[id]",
        id: "component:tickets/[id]",
        shortId: "abcdef",
        params: ["id"],
        catchAll: null,
      },
    ]);
    expect(encodeComponentRoute("tickets/[id]", { id: "7" })).toBe("n:abcdef:7");
    expect(() => encodeComponentRoute("nope", {})).toThrow(/No component route "nope"/);
    expect(() => encodeComponentRoute("tickets/[id]", { id: "7", extra: "x" })).toThrow(
      /no parameter "extra"/,
    );
    expect(() => encodeComponentRoute("tickets/[id]", {})).toThrow(/parameter "id"/);
  });
});

describe("validateConfig", () => {
  const ok = (value: unknown) => validateConfig(value, "nectar.config.ts");
  const bad = (value: unknown, message: RegExp) => {
    expect(() => ok(value)).toThrow(ConfigError);
    expect(() => ok(value)).toThrow(message);
  };

  test("accepts minimal and full configs", () => {
    expect(ok({ intents: [] })).toEqual({ intents: [] });
    expect(
      ok({
        intents: ["Guilds", 2],
        partials: [1],
        client: { closeTimeout: 1 },
        eager: true,
        env: "test",
        appDir: "src/app",
        outDir: "build",
        dev: { guilds: ["123"] },
        commands: { target: ["456"] },
      }),
    ).toMatchObject({ eager: true });
  });

  test("rejects bad shapes with the field named", () => {
    bad(null, /default export must be an object/);
    bad({}, /`intents` is required/);
    bad({ intents: [{}] }, /`intents` must be/);
    bad({ intents: [], partials: "x" }, /`partials`/);
    bad({ intents: [], eager: "yes" }, /`eager`/);
    bad({ intents: [], env: "staging" }, /`env`/);
    bad({ intents: [], appDir: "" }, /`appDir`/);
    bad({ intents: [], dev: { guilds: ["abc"] } }, /`dev.guilds`/);
    bad({ intents: [], commands: { target: "guild" } }, /`commands.target`/);
    bad({ intents: [], commands: { target: ["x"] } }, /`commands.target`/);
  });
});
