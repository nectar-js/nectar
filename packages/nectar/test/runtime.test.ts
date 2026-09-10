import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Client, Interaction } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildGraph } from "../src/compiler/index.js";
import { customIdFor } from "../src/components/index.js";
import { toManifest } from "../src/manifest/index.js";
import {
  createInteractionDispatcher,
  createRuntime,
  createSignals,
  GENERIC_ERROR_REPLY,
  ModuleRegistry,
  type RuntimeState,
  type Signal,
} from "../src/runtime/index.js";
import { makeApp } from "./helpers.js";

declare global {
  var __nectar: unknown[];
}

const push = (...values: string[]) => `globalThis.__nectar.push([${values.join(", ")}]);`;
const handler = (body: string) => `export default async function (ctx) { ${body} }\n`;
const cmd = (meta: string, body: string) => `export const meta = ${meta};\n${handler(body)}`;

const app = {
  "middleware.ts": `export default async function (ctx, next) { ${push('"root-mw"')} return next({ fromRoot: true }); }\n`,
  "error.ts": `export default async function (error, ctx) { ${push('"root-error"', "error.message", "ctx.route.id")} }\n`,
  "commands/ping/command.ts": cmd(
    '{ description: "d" }',
    `${push('"ping"', "ctx.fromRoot", "ctx.params && Object.keys(ctx.params).length")} await ctx.interaction.reply("pong");`,
  ),
  "commands/mod/route.ts": 'export const meta = { description: "d" };\n',
  "commands/mod/middleware.ts":
    "export default async function (ctx, next) { if (ctx.interaction.blocked) return; return next(); }\n",
  "commands/mod/ban/command.ts": cmd('{ description: "d" }', push('"ban"')),
  "commands/boom/command.ts": cmd('{ description: "d" }', 'throw new Error("boom");'),
  "commands/boom/error.ts": `export default async function (error) { ${push('"boom-error"')} return "unhandled"; }\n`,
  "commands/rethrow/command.ts": cmd('{ description: "d" }', 'throw new Error("first");'),
  "commands/rethrow/error.ts": 'export default async function () { throw new Error("second"); }\n',
  "commands/info/command.ts": cmd('{ type: "user" }', push('"info"')),
  "commands/search/command.ts": cmd(
    '{ description: "d", options: [{ type: "string", name: "q", description: "d", autocomplete: true }] }',
    push('"search"'),
  ),
  "commands/search/autocomplete.ts": `export async function q(ctx) { const v = ctx.interaction.options.getFocused(); if (v === "throw") throw new Error("ac"); await ctx.interaction.respond([{ name: v, value: v }]); }\n`,
  "components/tickets/[id]/close/button.ts": handler(push('"close"', "ctx.params.id")),
  "components/pick/select.ts": `export const kind = "string";\n${handler(push('"pick"'))}`,
  "components/form/modal.ts": handler(push('"form"')),
  "events/clientReady/event.ts":
    "export default async function (client, ctx) { globalThis.__nectar.push(['ready', ctx.route.id, typeof ctx.client]); }\n",
  "events/messageCreate/(a)/event.ts": `export const meta = { order: 1 };\nexport default async function (msg) { ${push('"a"', "msg")} }\n`,
  "events/messageCreate/(b)/event.ts": `export const meta = { order: 0 };\nexport default async function (msg) { await new Promise((r) => setTimeout(r, 10)); ${push('"b"', "msg")} }\n`,
  "events/guildMemberAdd/event.ts": `export const meta = { once: true };\n${handler(push('"member"'))}`,
  "events/guildMemberRemove/event.ts":
    'export default async function () { throw new Error("event-boom"); }\n',
};

interface FakeClient extends EventEmitter {
  login: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function fakeClient(): FakeClient {
  const client = new EventEmitter() as FakeClient;
  client.login = vi.fn(async () => "token");
  client.destroy = vi.fn(async () => {});
  return client;
}

async function setup(files: Record<string, string> = app) {
  const root = makeApp(files);
  const graph = await buildGraph(root);
  expect(graph.diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
  const manifest = toManifest(graph, root);
  const client = fakeClient();
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const signals = createSignals(logger);
  const state: RuntimeState = {
    manifest,
    appDir: root,
    client: client as unknown as Client,
    modules: new ModuleRegistry(),
    env: "test",
    logger,
    signals,
  };
  const componentRoute = (path: string) => {
    const route = graph.components.find((c) => c.path === path);
    if (route === undefined) throw new Error(`no component route ${path}`);
    return route;
  };
  return { root, manifest, client, logger, signals, state, componentRoute, graph };
}

function calls(): unknown[] {
  return globalThis.__nectar.splice(0);
}

/** A stubbed discord.js interaction. Every type guard is false unless overridden. */
function interaction(overrides: Record<string, unknown>): Interaction {
  const base = {
    id: "123",
    createdTimestamp: Date.now() - 5,
    replied: false,
    deferred: false,
    responded: false,
    reply: vi.fn(async () => {}),
    respond: vi.fn(async () => {}),
    isRepliable: () => true,
    isChatInputCommand: () => false,
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
  };
  return { ...base, ...overrides } as unknown as Interaction;
}

const chatInput = (
  name: string,
  group: string | null = null,
  sub: string | null = null,
  extra = {},
) =>
  interaction({
    isChatInputCommand: () => true,
    commandName: name,
    options: { getSubcommandGroup: () => group, getSubcommand: () => sub },
    ...extra,
  });

const component = (guard: string, customId: string) =>
  interaction({ [guard]: () => true, customId });

beforeEach(() => {
  globalThis.__nectar = [];
});

describe("interaction dispatch", () => {
  test("chat input command runs root middleware, extends context, and replies", async () => {
    const { state } = await setup();
    const dispatch = createInteractionDispatcher(state);
    const i = chatInput("ping");
    await dispatch(i);
    expect(calls()).toEqual([["root-mw"], ["ping", true, 0]]);
    expect((i as unknown as { reply: ReturnType<typeof vi.fn> }).reply).toHaveBeenCalledWith(
      "pong",
    );
  });

  test("subcommand lookup and nested middleware short-circuit", async () => {
    const { state } = await setup();
    const dispatch = createInteractionDispatcher(state);
    await dispatch(chatInput("mod", null, "ban"));
    expect(calls()).toEqual([["root-mw"], ["ban"]]);
    await dispatch(chatInput("mod", null, "ban", { blocked: true }));
    expect(calls()).toEqual([["root-mw"]]);
  });

  test("context menu command", async () => {
    const { state } = await setup();
    const dispatch = createInteractionDispatcher(state);
    await dispatch(
      interaction({ isContextMenuCommand: () => true, commandName: "info", commandType: 2 }),
    );
    expect(calls()).toEqual([["root-mw"], ["info"]]);
  });

  test("unknown commands are logged, not thrown", async () => {
    const { state, logger } = await setup();
    const dispatch = createInteractionDispatcher(state);
    await dispatch(chatInput("nope"));
    await dispatch(
      interaction({ isContextMenuCommand: () => true, commandName: "info", commandType: 3 }),
    );
    expect(calls()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0]?.[0]).toContain("/nope");
  });

  test("button with a param, select, and modal", async () => {
    const { state, componentRoute } = await setup();
    const dispatch = createInteractionDispatcher(state);
    await dispatch(
      component("isButton", customIdFor(componentRoute("tickets/[id]/close"), { id: "t:9" })),
    );
    await dispatch(component("isAnySelectMenu", customIdFor(componentRoute("pick"))));
    await dispatch(component("isModalSubmit", customIdFor(componentRoute("form"))));
    expect(calls()).toEqual([
      ["root-mw"],
      ["close", "t:9"],
      ["root-mw"],
      ["pick"],
      ["root-mw"],
      ["form"],
    ]);
  });

  test("foreign custom IDs are ignored silently, broken Nectar IDs with a warning", async () => {
    const { state, logger, componentRoute } = await setup();
    const dispatch = createInteractionDispatcher(state);
    await dispatch(component("isButton", "my-own-button"));
    expect(logger.warn).not.toHaveBeenCalled();

    await dispatch(component("isButton", `n:${componentRoute("tickets/[id]/close").shortId}`));
    await dispatch(component("isModalSubmit", customIdFor(componentRoute("pick"))));
    expect(logger.warn.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining("param-count"),
      expect.stringContaining("unknown-route"),
    ]);
    expect(calls()).toEqual([]);
  });

  test("autocomplete routes to the named export", async () => {
    const { state } = await setup();
    const dispatch = createInteractionDispatcher(state);
    const respond = vi.fn(async () => {});
    await dispatch(
      chatInput("search", null, null, {
        isChatInputCommand: () => false,
        isAutocomplete: () => true,
        options: {
          getSubcommandGroup: () => null,
          getSubcommand: () => null,
          getFocused: (full?: boolean) => (full ? { name: "q", value: "he" } : "he"),
        },
        respond,
      }),
    );
    expect(respond).toHaveBeenCalledWith([{ name: "he", value: "he" }]);
    expect(calls()).toEqual([["root-mw"]]);
  });

  test("a failing autocomplete goes to the boundary and answers with nothing", async () => {
    const { state } = await setup();
    const dispatch = createInteractionDispatcher(state);
    const respond = vi.fn(async () => {});
    await dispatch(
      interaction({
        isAutocomplete: () => true,
        commandName: "search",
        options: {
          getSubcommandGroup: () => null,
          getSubcommand: () => null,
          getFocused: (full?: boolean) => (full ? { name: "q", value: "throw" } : "throw"),
        },
        respond,
      }),
    );
    expect(calls()).toEqual([["root-mw"], ["root-error", "ac", "command:search"]]);
    expect(respond).toHaveBeenCalledWith([]);
  });

  test("trace exposes time since the interaction was created", async () => {
    const { state } = await setup({
      "commands/t/command.ts": cmd(
        '{ description: "d" }',
        "globalThis.__nectar.push([ctx.trace.id, ctx.trace.elapsed() >= 5, ctx.trace.receivedAt > 0]);",
      ),
    });
    await createInteractionDispatcher(state)(chatInput("t"));
    expect(calls()).toEqual([["123", true, true]]);
  });
});

describe("error boundaries", () => {
  test("nearest boundary returning unhandled bubbles to the root", async () => {
    const { state, logger } = await setup();
    await createInteractionDispatcher(state)(chatInput("boom"));
    expect(calls()).toEqual([["root-mw"], ["boom-error"], ["root-error", "boom", "command:boom"]]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("a throwing boundary passes its own error up", async () => {
    const { state } = await setup();
    await createInteractionDispatcher(state)(chatInput("rethrow"));
    expect(calls()).toEqual([["root-mw"], ["root-error", "second", "command:rethrow"]]);
  });

  test("default boundary logs with route identity and replies once, ephemerally", async () => {
    const { state, logger } = await setup({
      "commands/fail/command.ts": cmd('{ description: "d" }', 'throw new Error("unhandled!")'),
    });
    const dispatch = createInteractionDispatcher(state);

    const fresh = chatInput("fail");
    await dispatch(fresh);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("command:fail"),
      expect.objectContaining({
        route: "command:fail",
        trace: "123",
        error: expect.objectContaining({ message: "unhandled!" }),
      }),
    );
    expect((fresh as unknown as { reply: ReturnType<typeof vi.fn> }).reply).toHaveBeenCalledWith({
      content: GENERIC_ERROR_REPLY,
      flags: MessageFlags.Ephemeral,
    });

    const answered = chatInput("fail", null, null, { replied: true });
    await dispatch(answered);
    expect(
      (answered as unknown as { reply: ReturnType<typeof vi.fn> }).reply,
    ).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test("in development the default boundary reports route, file, interaction, and middleware", async () => {
    const { state, logger } = await setup({
      "middleware.ts": "export default async function (ctx, next) { return next(); }\n",
      "commands/mod/route.ts": 'export const meta = { description: "d" };\n',
      "commands/mod/middleware.ts":
        "export default async function (ctx, next) { return next(); }\n",
      "commands/mod/ban/command.ts": cmd('{ description: "d" }', 'throw new Error("nope")'),
    });
    state.env = "development";
    await createInteractionDispatcher(state)(
      chatInput("mod", null, "ban", { guildId: "g1", channelId: "c1", user: { id: "u1" } }),
    );
    const [message, fields] = logger.error.mock.calls[0] ?? [];
    expect(fields).toMatchObject({
      error: { message: "nope" },
      route: "command:mod/ban",
      guild: "g1",
      channel: "c1",
      user: "u1",
      interaction: "chatInput",
      command: "mod ban",
    });
    const lines = String(message).split("\n");
    expect(lines[0]).toBe("Unhandled error in command:mod/ban");
    expect(lines[1]).toMatch(/^ {2}file {9}.*commands[\\/]mod[\\/]ban[\\/]command\.ts$/);
    expect(lines[2]).toBe("  interaction  /mod ban (guild g1, channel c1, user u1)");
    expect(lines[3]).toMatch(/^ {2}elapsed {6}\d+ms since Discord created it$/);
    expect(lines[4]).toMatch(/^ {2}middleware {3}.*middleware\.ts$/);
    expect(lines[5]).toMatch(/^ {15}.*commands[\\/]mod[\\/]middleware\.ts$/);
    expect(lines).toHaveLength(6);
  });

  test("a handler that is not a function is reported through the boundaries", async () => {
    const { state, logger } = await setup({
      "commands/bad/command.ts": 'export const meta = { description: "d" };\nexport default 42;\n',
    });
    await createInteractionDispatcher(state)(chatInput("bad"));
    expect(logger.error.mock.calls[0]?.[1]?.error).toMatchObject({
      name: "HandlerLoadError",
      message: expect.stringContaining("got number"),
    });
  });
});

describe("events", () => {
  test("sequential handlers run in order, once handlers fire once, errors reach boundaries", async () => {
    const { state, client, logger } = await setup();
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [] },
      env: "test",
      logger,
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });
    expect(client.login).toHaveBeenCalledWith("t");

    client.emit("clientReady", "the-client");
    client.emit("messageCreate", "m1");
    client.emit("guildMemberAdd");
    client.emit("guildMemberAdd");
    client.emit("guildMemberRemove");
    await vi.waitFor(() => expect(globalThis.__nectar.length).toBe(5));

    // Events do not wait for each other, so the slow messageCreate pair lands last.
    expect(calls()).toEqual([
      ["ready", "event:clientReady", "object"],
      ["member"],
      ["root-error", "event-boom", "event:guildMemberRemove"],
      ["b", "m1"],
      ["a", "m1"],
    ]);
    expect(client.listenerCount("guildMemberAdd")).toBe(0);
    expect(client.listenerCount("messageCreate")).toBe(1);

    await runtime.stop();
    expect(client.listenerCount("messageCreate")).toBe(0);
    expect(client.listenerCount("interactionCreate")).toBe(0);
    expect(client.destroy).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  test("concurrent mode does not wait between handlers", async () => {
    const { state, client } = await setup({
      "events/messageCreate/(slow)/event.ts": `export const meta = { mode: "concurrent", order: 0 };\nexport default async function () { await new Promise((r) => setTimeout(r, 10)); ${push('"slow"')} }\n`,
      "events/messageCreate/(fast)/event.ts": `export const meta = { order: 1 };\n${handler(push('"fast"'))}`,
    });
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [] },
      env: "test",
      logger: state.logger,
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });
    client.emit("messageCreate");
    await vi.waitFor(() => expect(globalThis.__nectar.length).toBe(2));
    expect(calls()).toEqual([["fast"], ["slow"]]);
    await runtime.stop();
  });
});

describe("lifecycle", () => {
  test("eager loading fails start on a broken module", async () => {
    const { state, client } = await setup({
      "commands/ok/command.ts": cmd('{ description: "d" }', ""),
      "middleware.ts": 'import "./missing.js";\nexport default async function () {}\n',
    });
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [], eager: true },
      env: "test",
      logger: state.logger,
      client: client as unknown as Client,
    });
    await expect(runtime.start({ token: "t", signals: false })).rejects.toMatchObject({
      name: "HandlerLoadError",
    });
    expect(client.login).not.toHaveBeenCalled();
  });

  test("interactions are dispatched from the client and drained on stop", async () => {
    const { state, client } = await setup({
      "commands/slow/command.ts": cmd(
        '{ description: "d" }',
        `await new Promise((r) => setTimeout(r, 20)); ${push('"slow-done"')}`,
      ),
    });
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [] },
      env: "test",
      logger: state.logger,
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });
    client.emit("interactionCreate", chatInput("slow"));
    await runtime.stop();
    expect(calls()).toEqual([["slow-done"]]);
  });

  test("SIGINT stops the runtime", async () => {
    const { state, client } = await setup({
      "commands/ok/command.ts": cmd('{ description: "d" }', ""),
    });
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [] },
      env: "test",
      logger: state.logger,
      client: client as unknown as Client,
    });
    const before = process.listenerCount("SIGINT");
    await runtime.start({ token: "t" });
    expect(process.listenerCount("SIGINT")).toBe(before + 1);
    process.emit("SIGINT");
    await vi.waitFor(() => expect(client.destroy).toHaveBeenCalledTimes(1));
    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});

describe("update", () => {
  test("a new manifest changes dispatch and rebinds events without touching the client", async () => {
    const { state, client, logger } = await setup({
      "commands/one/command.ts": cmd('{ description: "d" }', push('"one"')),
      "events/messageCreate/event.ts": handler(push('"msg-old"')),
    });
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [] },
      env: "test",
      logger,
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });

    mkdirSync(path.join(state.appDir, "commands/two"));
    writeFileSync(
      path.join(state.appDir, "commands/two/command.ts"),
      cmd('{ description: "d" }', push('"two"')),
    );
    mkdirSync(path.join(state.appDir, "events/guildMemberAdd"));
    writeFileSync(
      path.join(state.appDir, "events/guildMemberAdd/event.ts"),
      handler(push('"member"')),
    );
    const next = toManifest(await buildGraph(state.appDir), state.appDir);
    runtime.update(next);

    client.emit("interactionCreate", chatInput("two"));
    client.emit("messageCreate");
    client.emit("guildMemberAdd");
    await vi.waitFor(() => expect(globalThis.__nectar.length).toBe(3));
    expect(new Set(calls())).toEqual(new Set([["two"], ["msg-old"], ["member"]]));
    expect(client.listenerCount("messageCreate")).toBe(1);
    expect(client.listenerCount("interactionCreate")).toBe(1);
    expect(client.login).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(client.listenerCount("guildMemberAdd")).toBe(0);
  });
});

describe("signals", () => {
  const types = (seen: Signal[]) => seen.map((s) => s.type);

  test("fire in order across a full interaction lifecycle", async () => {
    const { state, signals, componentRoute } = await setup();
    const seen: Signal[] = [];
    signals.on((s) => seen.push(s));
    const dispatch = createInteractionDispatcher(state);

    await dispatch(chatInput("ping", null, null, { guildId: "g1", user: { id: "u1" } }));
    expect(types(seen)).toEqual([
      "interaction:start",
      "route:match",
      "middleware:enter",
      "handler:enter",
      "handler:complete",
      "interaction:complete",
    ]);
    const start = seen[0];
    expect(start).toMatchObject({
      trace: "123",
      interaction: { type: "chatInput", command: "ping", guildId: "g1", userId: "u1" },
    });
    expect(seen[2]).toMatchObject({ file: expect.stringMatching(/middleware\.ts$/) });
    expect(seen[5]).toMatchObject({ route: { id: "command:ping" }, handled: true });
    expect(seen.every((s) => typeof s.at === "number")).toBe(true);

    // Middleware stopping the chain: no handler signals, complete says so.
    seen.length = 0;
    await dispatch(chatInput("mod", null, "ban", { blocked: true }));
    expect(types(seen)).toEqual([
      "interaction:start",
      "route:match",
      "middleware:enter",
      "middleware:enter",
      "interaction:complete",
    ]);
    expect(seen[4]).toMatchObject({ handled: false });

    // A component: the custom ID reaches listeners with its params hidden.
    seen.length = 0;
    const id = customIdFor(componentRoute("tickets/[id]/close"), { id: "secret" });
    await dispatch(component("isButton", id));
    expect(seen[0]).toMatchObject({
      interaction: { type: "button", customId: `${id.slice(0, id.lastIndexOf(":"))}:*` },
    });
    expect(JSON.stringify(seen)).not.toContain("secret");
  });

  test("failures report the boundary that handled them", async () => {
    const { state, signals } = await setup();
    const seen: Signal[] = [];
    signals.on((s) => seen.push(s));
    const dispatch = createInteractionDispatcher(state);

    await dispatch(chatInput("boom"));
    expect(types(seen).slice(-2)).toEqual(["handler:enter", "interaction:fail"]);
    expect(seen.at(-1)).toMatchObject({
      route: { id: "command:boom" },
      error: { message: "boom" },
      boundary: expect.stringMatching(/[\\/]error\.ts$/),
    });
    expect((seen.at(-1) as { boundary: string }).boundary).not.toMatch(/commands[\\/]boom/);
  });

  test("the default boundary reports as null", async () => {
    const { state, signals } = await setup({
      "commands/fail/command.ts": cmd('{ description: "d" }', 'throw new Error("nobody")'),
    });
    const seen: Signal[] = [];
    signals.on((s) => seen.push(s));
    await createInteractionDispatcher(state)(chatInput("fail"));
    expect(seen.at(-1)).toMatchObject({ type: "interaction:fail", boundary: null });
  });

  test("a throwing listener is logged and does not break dispatch", async () => {
    const { state, signals, logger } = await setup();
    signals.on(() => {
      throw new Error("listener");
    });
    await createInteractionDispatcher(state)(chatInput("ping"));
    expect(calls()).toEqual([["root-mw"], ["ping", true, 0]]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("interaction:start"),
      expect.objectContaining({ error: expect.objectContaining({ message: "listener" }) }),
    );
  });

  test("event failures, gateway state, shutdown, and config.observe", async () => {
    const { state, client } = await setup();
    const seen: Signal[] = [];
    const runtime = createRuntime({
      manifest: state.manifest,
      appDir: state.appDir,
      config: { intents: [], observe: (s) => seen.push(s) },
      env: "test",
      logger: state.logger,
      client: client as unknown as Client,
    });
    await runtime.start({ token: "t", signals: false });

    client.emit("shardReady", 0);
    client.emit("shardDisconnect", { code: 1006 }, 0);
    client.emit("shardResume", 0, 3);
    client.emit("guildMemberRemove");
    await vi.waitFor(() => expect(globalThis.__nectar.length).toBe(1));
    await runtime.stop();

    expect(types(seen)).toEqual([
      "gateway:connect",
      "gateway:disconnect",
      "gateway:connect",
      "event:fail",
      "shutdown",
    ]);
    expect(seen[0]).toMatchObject({ shard: 0, resumed: false });
    expect(seen[1]).toMatchObject({ shard: 0, code: 1006 });
    expect(seen[2]).toMatchObject({ resumed: true });
    expect(seen[3]).toMatchObject({
      event: "guildMemberRemove",
      route: { id: "event:guildMemberRemove" },
      error: { message: "event-boom" },
      boundary: expect.stringMatching(/error\.ts$/),
    });
    expect(client.listenerCount("shardReady")).toBe(0);
  });
});
