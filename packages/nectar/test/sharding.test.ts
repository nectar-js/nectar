import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShardingManager } from "discord.js";
import { afterEach, expect, test } from "vitest";
import { WebSocketServer } from "ws";
import { run } from "../src/cli/index.js";
import { makeProject } from "./helpers.js";

const nectarPackage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ping = 'export const meta = { description: "Pong" };\nexport default async function () {}\n';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

/**
 * Stands in for Discord. REST answers `/gateway/bot`; the gateway sends HELLO and answers each
 * IDENTIFY with a READY for the shard it names.
 */
async function fakeDiscord(shards: number) {
  const identified: [number, number][] = [];
  const tokens: string[] = [];
  let url = "";
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/gateway/bot") !== true) {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    const limit = { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 };
    res.end(JSON.stringify({ url, shards, session_start_limit: limit }));
  });
  const gateway = new WebSocketServer({ server });
  gateway.on("connection", (socket) => {
    const send = (payload: object) => socket.send(JSON.stringify({ s: null, t: null, ...payload }));
    send({ op: 10, d: { heartbeat_interval: 45_000 } });
    socket.on("message", (raw) => {
      const { op, d } = JSON.parse(String(raw)) as {
        op: number;
        d: { shard: [number, number]; token: string };
      };
      if (op === 1) send({ op: 11 });
      if (op !== 2) return;
      identified.push(d.shard);
      tokens.push(d.token);
      send({
        op: 0,
        s: 1,
        t: "READY",
        d: {
          v: 10,
          user: { id: "1", username: "nectar", discriminator: "0", avatar: null, bot: true },
          guilds: [],
          session_id: `session-${d.shard[0]}`,
          resume_gateway_url: url,
          shard: d.shard,
          application: { id: "1", flags: 0 },
        },
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  url = `ws://127.0.0.1:${port}`;
  cleanup.push(() => {
    for (const client of gateway.clients) client.terminate();
    gateway.close();
    server.close();
  });
  return { api: `http://127.0.0.1:${port}/api`, identified, tokens };
}

/** A built project whose `@nectar-js/nectar` resolves to this package. */
async function builtProject(files: Record<string, string>, config: string) {
  const root = makeProject(files, config);
  mkdirSync(path.join(root, "node_modules/@nectar-js"), { recursive: true });
  symlinkSync(nectarPackage, path.join(root, "node_modules/@nectar-js/nectar"), "junction");
  const io = { cwd: root, env: {}, out: () => {}, err: () => {} };
  expect(await run(["build"], io)).toBe(0);
  return root;
}

test("a ShardingManager runs the build once per shard", { timeout: 60_000 }, async () => {
  const discord = await fakeDiscord(2);
  // Writes down the shards of each process that runs the application-global hook.
  const plugin = `{
    name: "mark",
    startGlobal: (app) =>
      process.getBuiltinModule("node:fs").appendFileSync(
        import.meta.dirname + "/global.log",
        JSON.stringify(app.client.options.shards) + "\\n",
      ),
  }`;
  const root = await builtProject(
    { "commands/ping/command.ts": ping },
    `{ intents: [], client: { rest: { api: "${discord.api}" } }, plugins: [${plugin}] }`,
  );

  const manager = new ShardingManager(path.join(root, ".nectar/start.mjs"), {
    totalShards: 2,
    token: "not-a-real-token",
    respawn: false,
    silent: true,
  });
  const output: string[] = [];
  manager.on("shardCreate", (shard) => {
    shard.on("spawn", (child) => {
      child.stdout?.on("data", (chunk) => output.push(String(chunk)));
      child.stderr?.on("data", (chunk) => output.push(String(chunk)));
    });
  });
  await manager.spawn({ delay: 0, timeout: 30_000 });

  expect(discord.identified.sort()).toEqual([
    [0, 2],
    [1, 2],
  ]);
  expect(await manager.broadcastEval((client) => client.options.shards)).toEqual([[0], [1]]);
  expect(output.join("")).toContain("Logged in as nectar (test, shard 0 of 2).");
  expect(output.join("")).toContain("Logged in as nectar (test, shard 1 of 2).");
  expect(readFileSync(path.join(root, "global.log"), "utf8")).toBe("[0]\n");

  // A manager that goes away closes the IPC channel; each shard stops and its process exits.
  const exits = [...manager.shards.values()].map((shard) => {
    const child = shard.process;
    if (child === null) throw new Error(`shard ${shard.id} has no process`);
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    child.disconnect();
    return exited;
  });
  expect(await Promise.all(exits)).toEqual([0, 0]);
  expect(output.join("")).not.toContain("Error");
});

test("shards of a manager without a token read it from .env", { timeout: 60_000 }, async () => {
  const discord = await fakeDiscord(1);
  const root = await builtProject(
    { "commands/ping/command.ts": ping },
    `{ intents: [], client: { rest: { api: "${discord.api}" } } }`,
  );
  writeFileSync(path.join(root, ".env"), "DISCORD_TOKEN=from-env-file\n");

  // With no token option and no DISCORD_TOKEN in its own env, the manager hands its shards
  // DISCORD_TOKEN="null", and writes the same into this process's env.
  const previous = process.env.DISCORD_TOKEN;
  delete process.env.DISCORD_TOKEN;
  cleanup.push(() => {
    if (previous === undefined) delete process.env.DISCORD_TOKEN;
    else process.env.DISCORD_TOKEN = previous;
  });
  const manager = new ShardingManager(path.join(root, ".nectar/start.mjs"), {
    totalShards: 1,
    respawn: false,
    silent: true,
  });
  await manager.spawn({ delay: 0, timeout: 30_000 });
  expect(discord.tokens).toEqual(["from-env-file"]);

  const child = manager.shards.get(0)?.process;
  if (child == null) throw new Error("shard 0 has no process");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.disconnect();
  await exited;
});
