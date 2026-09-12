import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Client, Interaction } from "discord.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { run } from "../src/cli/index.js";
import { buildGraph } from "../src/compiler/index.js";
import { ConfigError, validateConfig } from "../src/config.js";
import { toManifest } from "../src/manifest/index.js";
import { applyPlugins, type NectarPlugin, type PluginGraph } from "../src/plugins/index.js";
import { createRuntime } from "../src/runtime/index.js";
import { toTypes } from "../src/typegen/index.js";
import { makeApp, makeProject } from "./helpers.js";

declare global {
  var __nectar: unknown[];
}

beforeEach(() => {
  globalThis.__nectar = [];
});

const app = {
  "middleware.ts": "export default async function (ctx, next) { return next(); }\n",
  "commands/ping/command.ts": `export const meta = { description: "d" };\nexport default async function (ctx) { globalThis.__nectar.push(["ping", ctx.services.audit.name]); }\n`,
  "commands/search/command.ts": `export const meta = { description: "d", options: [{ type: "string", name: "q", description: "d", autocomplete: true }] };\nexport default async function () {}\n`,
  "commands/search/autocomplete.ts": "export async function q() {}\n",
  "components/close/button.ts": "export default async function () {}\n",
  // Not a reserved name, so the compiler ignores it and a plugin can point at it.
  "plugins/audit.js": `export default async function (ctx, next) { globalThis.__nectar.push(["audit", ctx.route.id]); return next(); }\n`,
};

const middlewareIn = (root: string) => path.join(root, "plugins", "audit.js");

const adds = (name: string, file: string, position?: "outer" | "inner"): NectarPlugin => ({
  name,
  transform: (graph) =>
    graph.routes
      .filter((r) => r.kind === "command")
      .map((r) => ({ type: "middleware", route: r.id, file, ...(position ? { position } : {}) })),
});

describe("route transforms", () => {
  test("adds middleware to the chain and records the plugin on the route", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    await applyPlugins(graph, [adds("audit", middlewareIn(root))]);
    expect(graph.diagnostics.items).toEqual([]);

    const manifest = toManifest(graph, root);
    const ping = manifest.routes.find((r) => r.id === "command:ping");
    expect(ping?.middleware).toEqual(["plugins/audit.js", "middleware.ts"]);
    expect(ping?.plugins).toEqual(["audit"]);
    // A command and its autocomplete share an ID, so both are touched.
    const kinds = manifest.routes.filter((r) => r.id === "command:search").map((r) => r.kind);
    expect(kinds.sort()).toEqual(["autocomplete", "command"]);
    for (const r of manifest.routes.filter((r) => r.id === "command:search")) {
      expect(r.plugins).toEqual(["audit"]);
    }
    const close = manifest.routes.find((r) => r.id === "component:close");
    expect(close?.middleware).toEqual(["middleware.ts"]);
    expect(close?.plugins).toEqual([]);
  });

  test("kind narrows a change to one of the routes sharing an ID", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    await applyPlugins(graph, [
      {
        name: "audit",
        transform: () => [
          {
            type: "middleware",
            route: "command:search",
            kind: "command",
            file: middlewareIn(root),
          },
          {
            type: "middleware",
            route: "command:ping",
            kind: "autocomplete",
            file: middlewareIn(root),
          },
        ],
      },
    ]);
    expect(graph.diagnostics.items.map((d) => d.message)).toEqual([
      'Plugin "audit" adds middleware to route "command:ping (autocomplete)", which does not exist. Route IDs look like "command:moderation/ban".',
    ]);
    const search = toManifest(graph, root).routes.filter((r) => r.id === "command:search");
    expect(search.map((r) => [r.kind, r.plugins])).toEqual([
      ["autocomplete", []],
      ["command", ["audit"]],
    ]);
  });

  test("inner middleware runs right before the handler", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    await applyPlugins(graph, [adds("audit", middlewareIn(root), "inner")]);
    const ping = toManifest(graph, root).routes.find((r) => r.id === "command:ping");
    expect(ping?.middleware).toEqual(["middleware.ts", "plugins/audit.js"]);
  });

  test("plugins run in config order and each sees the previous plugin's changes", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    const seen: string[][] = [];
    const spy = (name: string): NectarPlugin => ({
      name,
      transform: (g) => {
        const ping = g.routes.find((r) => r.id === "command:ping");
        seen.push([name, ...(ping?.plugins ?? [])]);
      },
    });
    await applyPlugins(graph, [spy("first"), adds("audit", middlewareIn(root)), spy("last")]);
    expect(seen).toEqual([["first"], ["last", "audit"]]);
  });

  test("the graph a plugin receives is frozen and carries absolute paths", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    let view: PluginGraph | undefined;
    await applyPlugins(graph, [
      {
        name: "mutator",
        transform: (g) => {
          view = g;
          const route = g.routes[0] as unknown as { middleware: string[] };
          expect(() => route.middleware.push("x")).toThrow(TypeError);
          expect(() => {
            (g as { routes: unknown }).routes = [];
          }).toThrow(TypeError);
        },
      },
    ]);
    expect(graph.diagnostics.items).toEqual([]);
    expect(view?.appDir).toBe(root);
    expect(view?.routes.every((r) => path.isAbsolute(r.file))).toBe(true);
    // Nothing leaked into the real graph.
    expect(graph.chains.get(path.join(root, "commands", "ping", "command.ts"))?.middleware).toEqual(
      [path.join(root, "middleware.ts")],
    );
  });

  test("bad changes become diagnostics instead of touching the graph", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    await applyPlugins(graph, [
      {
        name: "broken",
        transform: () => [
          { type: "middleware", route: "command:nope", file: middlewareIn(root) },
          { type: "middleware", route: "command:ping", file: "plugins/audit.js" },
          { type: "middleware", route: "command:ping", file: path.join(root, "missing.js") },
          { type: "nonsense" } as never,
          { type: "diagnostic", severity: "warning", code: "audit-hint", message: "hi" },
        ],
      },
      {
        name: "thrower",
        transform: () => {
          throw new Error("kaboom");
        },
      },
      { name: "wrong-shape", transform: () => "no" as never },
    ]);
    expect(graph.diagnostics.items.map((d) => [d.code, d.severity])).toEqual([
      ["plugin-unknown-route", "error"],
      ["plugin-missing-file", "error"],
      ["plugin-missing-file", "error"],
      ["plugin-invalid-change", "error"],
      ["audit-hint", "warning"],
      ["plugin-failed", "error"],
      ["plugin-invalid-change", "error"],
    ]);
    expect(graph.diagnostics.items[5]?.message).toContain('Plugin "thrower"');
    expect(graph.diagnostics.items[5]?.message).toContain("kaboom");
    expect(toManifest(graph, root).routes.every((r) => r.plugins.length === 0)).toBe(true);
  });

  test("middleware for an event route is rejected", async () => {
    const root = makeApp({
      ...app,
      "events/clientReady/event.ts": "export default async () => {};\n",
    });
    const graph = await buildGraph(root);
    await applyPlugins(graph, [
      {
        name: "events",
        transform: () => [
          { type: "middleware", route: "event:clientReady", file: middlewareIn(root) },
        ],
      },
    ]);
    expect(graph.diagnostics.items.map((d) => d.code)).toEqual(["plugin-invalid-change"]);
    expect(graph.diagnostics.items[0]?.message).toContain("event handlers don't run middleware");
    expect(toManifest(graph, root).routes.every((r) => r.middleware.length <= 1)).toBe(true);
  });
});

describe("generated types", () => {
  test("a plugin's declarations are appended after the augmentation", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    const types = toTypes(graph, path.join(root, ".nectar"), [
      { name: "quiet" },
      { name: "audit", types: (g) => `type Audited = ${g.routes.length};` },
      { name: "empty", types: () => "   " },
    ]);
    expect(types).toContain('// From plugin "audit"\ntype Audited = 4;');
    expect(types).not.toContain("quiet");
    expect(types).not.toContain("empty");
    expect(types.indexOf("export {};")).toBeLessThan(types.indexOf("Audited"));
  });

  test("a throwing types hook names the plugin", async () => {
    const graph = await buildGraph(makeApp(app));
    expect(() =>
      toTypes(graph, "/out", [
        {
          name: "audit",
          types: () => {
            throw new Error("nope");
          },
        },
      ]),
    ).toThrow('Plugin "audit": types failed: nope');
  });
});

describe("runtime hooks", () => {
  /** `shards` are the IDs this process runs, as a shard manager would assign them. */
  function fakeClient(shards?: number[]) {
    const client = new EventEmitter() as EventEmitter & {
      login: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      options: { shards?: number[] };
    };
    client.login = vi.fn(async () => "token");
    client.destroy = vi.fn(async () => {});
    client.options = shards === undefined ? {} : { shards };
    return client;
  }

  async function boot(plugins: NectarPlugin[], shards?: number[]) {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    await applyPlugins(graph, plugins);
    expect(graph.diagnostics.items).toEqual([]);
    const client = fakeClient(shards);
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = createRuntime({
      manifest: toManifest(graph, root),
      appDir: root,
      config: { intents: [], plugins },
      env: "test",
      logger,
      client: client as unknown as Client,
    });
    return { runtime, client, logger };
  }

  const ping = () =>
    ({
      id: "1",
      createdTimestamp: Date.now(),
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: "ping",
      options: { getSubcommandGroup: () => null, getSubcommand: () => null },
    }) as unknown as Interaction;

  test("services reach handlers; start runs in order, stop in reverse", async () => {
    const order: string[] = [];
    const { runtime, client } = await boot([
      {
        name: "audit",
        start: async ({ client, env }) => {
          order.push("start audit");
          expect(env).toBe("test");
          expect(typeof client.on).toBe("function");
          return { audit: { name: "the-log" } };
        },
        stop: () => {
          order.push("stop audit");
        },
      },
      {
        name: "other",
        start: () => {
          order.push("start other");
        },
        stop: async () => {
          order.push("stop other");
        },
      },
    ]);
    await runtime.start({ token: "t", signals: false });
    expect(order).toEqual(["start audit", "start other"]);
    expect(client.login).toHaveBeenCalledWith("t");

    client.emit("interactionCreate", ping());
    await vi.waitFor(() => expect(globalThis.__nectar).toEqual([["ping", "the-log"]]));

    await runtime.stop();
    expect(order).toEqual(["start audit", "start other", "stop other", "stop audit"]);
    expect(client.destroy).toHaveBeenCalled();
  });

  test("plugin middleware from a transform runs on the route", async () => {
    const root = makeApp(app);
    const graph = await buildGraph(root);
    const audit: NectarPlugin = {
      ...adds("audit", middlewareIn(root)),
      start: () => ({ audit: { name: "log" } }),
    };
    await applyPlugins(graph, [audit]);
    const client = fakeClient();
    const runtime = createRuntime({
      manifest: toManifest(graph, root),
      appDir: root,
      config: { intents: [], plugins: [audit] },
      env: "test",
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });
    client.emit("interactionCreate", ping());
    await vi.waitFor(() => expect(globalThis.__nectar.length).toBe(2));
    expect(globalThis.__nectar).toEqual([
      ["audit", "command:ping"],
      ["ping", "log"],
    ]);
    await runtime.stop();
  });

  test("two plugins providing the same service is a startup failure", async () => {
    const { runtime, client } = await boot([
      { name: "a", start: () => ({ audit: 1 }) },
      { name: "b", start: () => ({ audit: 2 }) },
    ]);
    await expect(runtime.start({ token: "t", signals: false })).rejects.toThrow(
      'Plugin "b": provides service "audit", which plugin "a" already provides.',
    );
    expect(client.login).not.toHaveBeenCalled();
  });

  test("a throwing start hook fails startup; a throwing stop hook is logged", async () => {
    const failing = await boot([
      {
        name: "a",
        start: () => {
          throw new Error("no db");
        },
      },
    ]);
    await expect(failing.runtime.start({ token: "t", signals: false })).rejects.toThrow(
      'Plugin "a": start failed: no db',
    );

    const { runtime, logger, client } = await boot([
      {
        name: "a",
        start: () => ({ audit: {} }),
        stop: () => {
          throw new Error("stuck");
        },
      },
    ]);
    await runtime.start({ token: "t", signals: false });
    await runtime.stop();
    expect(logger.error).toHaveBeenCalledWith(
      'Plugin "a": stop failed.',
      expect.objectContaining({ plugin: "a" }),
    );
    expect(client.destroy).toHaveBeenCalled();
  });

  test("global hooks run only in the process that runs shard 0", async () => {
    const order: string[] = [];
    const record = (name: string): NectarPlugin => ({
      name,
      start: () => {
        order.push(`start ${name}`);
      },
      stop: () => {
        order.push(`stop ${name}`);
      },
      startGlobal: () => {
        order.push(`startGlobal ${name}`);
      },
      stopGlobal: () => {
        order.push(`stopGlobal ${name}`);
      },
    });

    const primary = await boot([record("a"), record("b")], [0, 1]);
    await primary.runtime.start({ token: "t", signals: false });
    await primary.runtime.stop();
    expect(order.splice(0)).toEqual([
      "start a",
      "start b",
      "startGlobal a",
      "startGlobal b",
      "stopGlobal b",
      "stopGlobal a",
      "stop b",
      "stop a",
    ]);

    const other = await boot([record("a")], [2, 3]);
    await other.runtime.start({ token: "t", signals: false });
    await other.runtime.stop();
    expect(order).toEqual(["start a", "stop a"]);
  });

  test("a throwing startGlobal hook fails startup", async () => {
    const { runtime, client } = await boot([
      {
        name: "cron",
        startGlobal: () => {
          throw new Error("no schedule");
        },
      },
    ]);
    await expect(runtime.start({ token: "t", signals: false })).rejects.toThrow(
      'Plugin "cron": startGlobal failed: no schedule',
    );
    expect(client.login).not.toHaveBeenCalled();
  });
});

describe("config validation", () => {
  const check = (plugins: unknown) => () =>
    validateConfig({ intents: [], plugins }, "nectar.config.ts");

  test("accepts a plugin list and rejects malformed ones", () => {
    expect(check([{ name: "a" }, { name: "b", commands: [] }])).not.toThrow();
    expect(check({})).toThrow(ConfigError);
    expect(check([{}])).toThrow("`plugins[0]` must be an object with a non-empty `name`");
    expect(check([{ name: "a" }, { name: "a" }])).toThrow('Plugin "a" is listed twice');
    expect(check([{ name: "a", transform: 1 }])).toThrow("`transform` must be a function");
    expect(check([{ name: "a", startGlobal: 1 }])).toThrow("`startGlobal` must be a function");
  });

  test("plugin commands need a shape and cannot shadow built-ins", () => {
    expect(check([{ name: "a", commands: [{ name: "x" }] }])).toThrow("every command needs");
    expect(check([{ name: "a", commands: [{ name: "Bad", description: "", run() {} }] }])).toThrow(
      "every command needs",
    );
    expect(
      check([{ name: "a", commands: [{ name: "build", description: "", run() {} }] }]),
    ).toThrow('command "build" is built into nectar');
    const dup = { name: "x", description: "", run() {} };
    expect(
      check([
        { name: "a", commands: [dup] },
        { name: "b", commands: [dup] },
      ]),
    ).toThrow('Plugins "a" and "b" both define the command "x"');
  });
});

describe("cli", () => {
  async function nectar(argv: string[], cwd: string) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(argv, {
      cwd,
      env: {},
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  const config = `{
    intents: [],
    plugins: [{
      name: "audit",
      transform: (graph) => graph.routes
        .filter((r) => r.kind === "command")
        .map((r) => ({ type: "middleware", route: r.id, file: import.meta.dirname + "/app/plugins/audit.js" })),
      types: () => "type Audited = true;",
      commands: [{
        name: "audit",
        description: "Show the audit log.",
        options: { limit: { type: "string", description: "How many." } },
        run: ({ project, flags, out }) => { out("audit " + flags.limit + " " + project.env); return 0; },
      }],
    }],
  }`;

  test("plugin commands run with parsed flags and show up in help", async () => {
    const root = makeProject(app, config);
    const result = await nectar(["audit", "--limit", "3"], root);
    expect(result).toEqual({ code: 0, out: "audit 3 development", err: "" });
    const help = await nectar(["--help"], root);
    expect(help.out).toContain("Plugin commands:");
    expect(help.out).toContain("audit [--limit <value>]");
    expect((await nectar(["audit", "--help"], root)).out).toContain("Show the audit log.");
    expect((await nectar(["audit", "--nope"], root)).code).toBe(2);
    expect((await nectar(["frobnicate"], root)).err).toContain('Unknown command "frobnicate"');
  });

  test("build writes plugin middleware and types into the output", async () => {
    const root = makeProject(app, config);
    const result = await nectar(["build"], root);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(root, ".nectar", "manifest.json"), "utf8"));
    const ping = manifest.routes.find((r: { id: string }) => r.id === "command:ping");
    expect(ping.middleware).toEqual(["plugins/audit.js", "middleware.ts"]);
    expect(ping.plugins).toEqual(["audit"]);
    const types = readFileSync(path.join(root, ".nectar", "types.d.ts"), "utf8");
    expect(types).toContain('// From plugin "audit"\ntype Audited = true;');
    expect(types).toContain("plugins/audit.js");

    const inspect = await nectar(["manifest", "--route", "command:ping"], root);
    expect(JSON.parse(inspect.out)[0].plugins).toEqual(["audit"]);
  });

  test("a broken config surfaces when a plugin command is invoked", async () => {
    const root = makeProject(app, '{ intents: [], plugins: [{ name: "" }] }');
    const result = await nectar(["audit"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("non-empty `name`");
  });
});

describe("examples/plugin", () => {
  const example = path.resolve(import.meta.dirname, "../../../examples/plugin");

  async function nectar(argv: string[]) {
    const out: string[] = [];
    const code = await run(argv, { cwd: example, env: {}, out: (l) => out.push(l), err: () => {} });
    return { code, out: out.join("\n") };
  }

  test("every command gets the usage middleware and nectar gains a usage command", async () => {
    const ping = await nectar(["manifest", "--route", "command:ping"]);
    expect(ping.code).toBe(0);
    expect(JSON.parse(ping.out)[0]).toMatchObject({
      middleware: ["../plugins/usage/middleware.ts"],
      plugins: ["usage"],
    });
    expect(await nectar(["usage"])).toEqual({ code: 0, out: "No command runs logged yet." });
  });

  test("the service writes the log that nectar usage counts", async () => {
    const url = pathToFileURL(path.join(example, "plugins", "usage", "index.ts")).href;
    const { usage } = (await import(url)) as { usage: (o: { file: string }) => NectarPlugin };
    const dir = makeApp({});
    const plugin = usage({ file: path.join(dir, "usage.log") });

    const services = (await plugin.start?.({} as never)) as {
      usage: { record(command: string, userId: string): void };
    };
    // Start and stop markers go in the log too, and don't count as runs.
    await plugin.startGlobal?.({} as never);
    services.usage.record("ping", "1");
    services.usage.record("user/profile", "1");
    services.usage.record("ping", "2");
    await plugin.stopGlobal?.({} as never);
    await plugin.stop?.({} as never);

    const out: string[] = [];
    const project = { root: dir } as never;
    await plugin.commands?.[0]?.run({ project, flags: {}, out: (l) => out.push(l), err() {} });
    expect(out).toEqual(["     2  /ping", "     1  /user profile"]);
    expect(readFileSync(path.join(dir, "usage.log"), "utf8")).toMatch(
      /^\{"at":"[^"]+","event":"start"\}\n(.*\n){3}\{"at":"[^"]+","event":"stop"\}\n$/,
    );
  });

  test("types lists the app's commands, and an app without commands gets a warning", async () => {
    const url = pathToFileURL(path.join(example, "plugins", "usage", "index.ts")).href;
    const { usage } = (await import(url)) as { usage: () => NectarPlugin };
    const plugin = usage();
    const command = { kind: "command", id: "command:user/profile", path: "user/profile" };
    const graph = { appDir: "", routes: [command], commands: [], events: [] } as never;

    expect(plugin.types?.(graph)).toBe(
      'declare global {\n  interface NectarUsageCommands {\n    "user/profile": true;\n  }\n}',
    );
    expect(plugin.transform?.(graph)).toMatchObject([{ type: "middleware", kind: "command" }]);
    expect(plugin.transform?.({ ...(graph as object), routes: [] } as never)).toEqual([
      {
        type: "diagnostic",
        severity: "warning",
        code: "usage-empty",
        message: "No commands to count.",
      },
    ]);
  });
});
