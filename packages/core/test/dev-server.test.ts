import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client, Interaction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { loadProject } from "../src/cli/project.js";
import { enableModuleReloading } from "../src/compiler/load.js";
import { createDevServer } from "../src/dev/server.js";
import { makeProject } from "./helpers.js";

declare global {
  var __nect: unknown[];
}

const command = (value: string, description = "d") =>
  `export const meta = { description: "${description}" };\nexport default async function () { globalThis.__nect.push("${value}"); }\n`;

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

function fakeRest() {
  const store = new Map<string, unknown[]>();
  return {
    get: vi.fn(async (route: string) => store.get(route) ?? []),
    put: vi.fn(async (route: string, { body }: { body: unknown }) => {
      const stored = (body as Record<string, unknown>[]).map((c, i) => ({
        id: String(i),
        application_id: "app",
        type: 1,
        nsfw: false,
        contexts: null,
        integration_types: [0],
        default_member_permissions: null,
        ...c,
      }));
      store.set(route, stored);
      return stored;
    }),
  };
}

function chatInput(name: string): Interaction {
  return {
    id: "1",
    createdTimestamp: Date.now(),
    isChatInputCommand: () => true,
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    commandName: name,
    options: { getSubcommandGroup: () => null, getSubcommand: () => null },
  } as unknown as Interaction;
}

async function setup() {
  const root = makeProject(
    { "commands/ping/command.ts": command("ping-v1") },
    '{ intents: [], dev: { guilds: ["1"] } }',
  );
  const out: string[] = [];
  const err: string[] = [];
  const rest = fakeRest();
  const clients: FakeClient[] = [];
  const io = {
    cwd: root,
    env: { DISCORD_TOKEN: "t", DISCORD_APPLICATION_ID: "app" },
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    rest: async () => rest,
    client: () => {
      const client = fakeClient();
      clients.push(client);
      return client as unknown as Client;
    },
  };
  const server = createDevServer(await loadProject(root, io.env), io);
  await server.start();
  const client = () => clients.at(-1) as FakeClient;
  const invoke = async (name: string) => {
    client().emit("interactionCreate", chatInput(name));
    await vi.waitFor(() => expect(globalThis.__nect.length).toBeGreaterThan(0));
    return globalThis.__nect.splice(0);
  };
  const write = (rel: string, content: string) => {
    const file = path.join(root, ...rel.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  return { root, server, out, err, rest, clients, client, invoke, write };
}

// Reloading is enabled once per process, for one root. Every test project lives under tmpdir.
beforeAll(() => enableModuleReloading(tmpdir()));

beforeEach(() => {
  globalThis.__nect = [];
});

describe("dev server", () => {
  test("starts: compiles, registers dev commands, logs in", async () => {
    const { server, out, err, rest, clients } = await setup();
    expect(err).toEqual([]);
    expect(out).toEqual([
      "1 command, 0 component routes, 0 events in app/.",
      "guild:1: +ping (applied).",
    ]);
    expect(rest.put).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);
    expect(clients[0]?.login).toHaveBeenCalledWith("t");
    await server.stop();
    expect(clients[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  test("a handler edit takes effect on the next interaction without a reconnect", async () => {
    const { server, out, invoke, write, client, rest } = await setup();
    expect(await invoke("ping")).toEqual(["ping-v1"]);

    out.length = 0;
    const file = write("app/commands/ping/command.ts", command("ping-v2"));
    await server.apply([file]);
    expect(out).toEqual(["~ app/commands/ping/command.ts", "1 handler module reloaded."]);
    expect(await invoke("ping")).toEqual(["ping-v2"]);
    expect(client().login).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledTimes(1);
    await server.stop();
  });

  test("a new command rebuilds routes and registers; a metadata edit registers only", async () => {
    const { server, out, invoke, write, rest } = await setup();
    out.length = 0;
    const pong = write("app/commands/pong/command.ts", command("pong"));
    await server.apply([path.dirname(pong), pong]);
    expect(out).toEqual([
      "~ app/commands/pong",
      "~ app/commands/pong/command.ts",
      "guild:1: +pong (applied).",
      "Routes rebuilt (2 commands, 0 component routes, 0 events), 1 handler module reloaded.",
    ]);
    expect(await invoke("pong")).toEqual(["pong"]);
    expect(rest.put).toHaveBeenCalledTimes(2);

    out.length = 0;
    const ping = write("app/commands/ping/command.ts", command("ping-v1", "Ping!"));
    await server.apply([ping]);
    expect(out).toEqual([
      "~ app/commands/ping/command.ts",
      "guild:1: ~ping (applied).",
      "1 handler module reloaded.",
    ]);
    expect(rest.put).toHaveBeenCalledTimes(3);
    await server.stop();
  });

  test("a compile error keeps the previous routes and handlers running", async () => {
    const { server, err, invoke, write, root } = await setup();
    const bad = write("app/commands/Bad Name/command.ts", command("bad"));
    await server.apply([bad]);
    expect(err.at(-1)).toBe("Keeping the previous routes until this is fixed.");
    expect(err.some((l) => l.includes("Bad Name"))).toBe(true);
    expect(await invoke("ping")).toEqual(["ping-v1"]);

    rmSync(path.join(root, "app/commands/Bad Name"), { recursive: true });
    err.length = 0;
    await server.apply([bad]);
    expect(err).toEqual([]);
    await server.stop();
  });

  test("a dependency change reloads every module", async () => {
    const { server, out, write, invoke } = await setup();
    out.length = 0;
    const helper = write("app/lib/helper.ts", "export const x = 1;\n");
    await server.apply([helper]);
    expect(out).toEqual(["~ app/lib/helper.ts", "Every module reloaded."]);
    expect(await invoke("ping")).toEqual(["ping-v1"]);
    await server.stop();
  });

  test("ignored paths do nothing", async () => {
    const { server, out, err, write, root } = await setup();
    out.length = 0;
    await server.apply([path.join(root, ".nect/manifest.json"), write("README.md", "# hi\n")]);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
    await server.stop();
  });

  test("a config change restarts the runtime with the new config", async () => {
    const { server, out, write, clients, invoke } = await setup();
    out.length = 0;
    const config = write(
      "nect.config.js",
      'export default { intents: ["Guilds"], dev: { guilds: ["1"] } };\n',
    );
    await server.apply([config]);
    expect(clients).toHaveLength(2);
    expect(clients[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(clients[1]?.login).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      "~ nect.config.js",
      "Restarting with the new nect.config.js.",
      "1 command, 0 component routes, 0 events in app/.",
    ]);
    expect(await invoke("ping")).toEqual(["ping-v1"]);
    await server.stop();
  });

  test("without dev guilds or an application ID, registration is skipped with one warning", async () => {
    const root = makeProject({ "commands/ping/command.ts": command("ping") });
    const err: string[] = [];
    const io = {
      cwd: root,
      env: { DISCORD_TOKEN: "t" },
      out: () => {},
      err: (line: string) => err.push(line),
      client: () => fakeClient() as unknown as Client,
    };
    const server = createDevServer(await loadProject(root, io.env), io);
    await server.start();
    await server.apply([path.join(root, "app/commands/ping/command.ts")]);
    expect(err).toEqual(["Commands are not registered: add dev.guilds to nect.config.js."]);
    await server.stop();
  });
});
