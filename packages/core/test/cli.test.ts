import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type CliIo, run } from "../src/cli/index.js";
import { version } from "../src/version.js";
import { makeProject } from "./helpers.js";

const basic = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/basic");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export async function nect(
  argv: string[],
  cwd: string,
  extra: Partial<CliIo> = {},
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    cwd,
    env: {},
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...extra,
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const ping = 'export const meta = { description: "Pong" };\nexport default async function () {}\n';

describe("nect", () => {
  test("help and version", async () => {
    const bare = await nect([], basic);
    expect(bare.code).toBe(2);
    expect(bare.out).toContain("Usage: nect <command>");
    expect((await nect(["--help"], basic)).code).toBe(0);
    expect((await nect(["--version"], basic)).out).toBe(version);
    expect((await nect(["build", "--help"], basic)).out).toContain("Usage: nect build");
  });

  test("unknown commands and flags exit 2", async () => {
    const unknown = await nect(["frobnicate"], basic);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('Unknown command "frobnicate"');
    const flag = await nect(["build", "--nope"], basic);
    expect(flag.code).toBe(2);
    expect(flag.err).toContain("--nope");
  });

  test("missing config is a clear failure", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "nect-empty-"));
    temps.push(root);
    const result = await nect(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("No nect.config.ts in");
  });

  test("invalid config names the field", async () => {
    const root = makeProject({}, "{ intents: [], dev: { guilds: ['x'] } }");
    const result = await nect(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("`dev.guilds`");
  });
});

describe("nect check", () => {
  test("examples/basic passes", async () => {
    const result = await nect(["check"], basic);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(result.out).toBe("No problems. 3 commands, 4 component routes, 2 events in app/.");
  });

  test("reports diagnostics with file and code, writes nothing", async () => {
    const root = makeProject({
      "commands/ping/command.ts": ping,
      "commands/Bad Name/command.ts": ping,
    });
    const result = await nect(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^error\[[a-z-]+\] app\/commands\/Bad Name/m);
    expect(result.err).toContain("1 error.");
    expect(existsSync(path.join(root, ".nect"))).toBe(false);
  });
});

describe("nect build", () => {
  test("writes the manifest and types into outDir", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], outDir: "build/nect" }',
    );
    const result = await nect(["build"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Built 1 command, 0 component routes, 0 events.");
    expect(result.out).toContain("build/nect/manifest.json");
    const manifest = JSON.parse(readFileSync(path.join(root, "build/nect/manifest.json"), "utf8"));
    expect(manifest.appDir).toBe("../../app");
    expect(manifest.commands.map((c: { name: string }) => c.name)).toEqual(["ping"]);
    expect(readFileSync(path.join(root, "build/nect/types.d.ts"), "utf8")).toContain('"ping"');
  });

  test("fails without writing when the app is invalid", async () => {
    const root = makeProject({ "commands/ping/command.ts": "export default 1;\n" });
    const result = await nect(["build"], root);
    expect(result.code).toBe(1);
    expect(existsSync(path.join(root, ".nect"))).toBe(false);
  });
});

describe("nect routes", () => {
  test("examples/basic tree", async () => {
    const result = await nect(["routes"], basic);
    expect(result.code).toBe(0);
    expect(result.out).toMatchSnapshot();
  });
});

describe("nect manifest", () => {
  test("prints the manifest", async () => {
    const result = await nect(["manifest"], basic);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out);
    expect(parsed.version).toBe(1);
    expect(parsed.commands.map((c: { name: string }) => c.name)).toEqual([
      "moderation",
      "ping",
      "user",
    ]);
  });

  test("--route answers the ownership questions", async () => {
    const ban = await nect(["manifest", "--route", "command:moderation/ban"], basic);
    expect(ban.code).toBe(0);
    const [detail] = JSON.parse(ban.out);
    expect(detail.file).toBe("commands/moderation/ban/command.ts");
    expect(detail.middleware).toEqual(["middleware.ts", "commands/moderation/middleware.ts"]);
    expect(detail.errors).toEqual(["error.ts"]);
    expect(detail.command).toMatchObject({ name: "moderation", position: "ban" });
    expect(detail.command.payload.name).toBe("moderation");

    const byPath = await nect(["manifest", "--route", "pagination/[page]/next"], basic);
    const [button] = JSON.parse(byPath.out);
    expect(button.customId).toMatch(/^n:[a-z0-9]{6}:<page>$/);

    const both = await nect(["manifest", "--route", "command:user/profile"], basic);
    const details = JSON.parse(both.out);
    expect(details.map((d: { kind: string }) => d.kind)).toEqual(["autocomplete", "command"]);
    expect(details[0].commandRoute).toBe("commands/user/profile/command.ts");

    const event = await nect(["manifest", "--route", "event:guildMemberAdd/(welcome)"], basic);
    expect(JSON.parse(event.out)[0].eventHandlers.handlers).toHaveLength(2);
  });

  test("unknown route lists the known ones", async () => {
    const result = await nect(["manifest", "--route", "nope"], basic);
    expect(result.code).toBe(1);
    expect(result.err).toContain('No route "nope"');
    expect(result.err).toContain("  command:ping");
  });
});

function fakeRest() {
  const store = new Map<string, unknown[]>();
  const rest = {
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
  return rest;
}

describe("nect sync", () => {
  const creds = { DISCORD_TOKEN: "t", DISCORD_APPLICATION_ID: "app" };
  const devConfig = '{ intents: [], dev: { guilds: ["1"] } }';

  test("needs credentials and a target", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const noToken = await nect(["sync"], root, { env: { DISCORD_APPLICATION_ID: "app" } });
    expect(noToken.code).toBe(1);
    expect(noToken.err).toContain("DISCORD_TOKEN is not set");

    const noTarget = await nect(["sync"], makeProject({ "commands/ping/command.ts": ping }), {
      env: creds,
    });
    expect(noTarget.code).toBe(1);
    expect(noTarget.err).toContain("No registration target for development");
  });

  test("registers, then a second run is a cache hit", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const rest = fakeRest();
    const io = { env: creds, rest: async () => rest };

    const first = await nect(["sync"], root, io);
    expect(first.code).toBe(0);
    expect(first.out).toBe("guild:1: +ping (applied).");
    expect(rest.put).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(root, ".nect/registration.json"))).toBe(true);

    const second = await nect(["sync"], root, io);
    expect(second.out).toBe("guild:1: unchanged since last sync.");
    expect(rest.get).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledTimes(1);
  });

  test("dry run reports without writing, and the guard needs --force", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const rest = fakeRest();
    const io = { env: creds, rest: async () => rest };

    const dry = await nect(["sync", "--dry-run"], root, io);
    expect(dry.code).toBe(0);
    expect(dry.out).toBe("guild:1: +ping (would apply).");
    expect(rest.put).not.toHaveBeenCalled();

    await nect(["sync"], root, io);
    rmSync(path.join(root, "app/commands"), { recursive: true });
    const refused = await nect(["sync"], root, io);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("Refusing to register commands");
    expect(rest.put).toHaveBeenCalledTimes(1);

    const forced = await nect(["sync", "--force"], root, io);
    expect(forced.code).toBe(0);
    expect(forced.out).toBe("guild:1: -ping (applied).");
    expect(forced.err).toContain("Forced past:");
  });

  test("production goes to commands.target", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], env: "production", commands: { target: ["7"] } }',
    );
    const rest = fakeRest();
    await nect(["sync"], root, { env: creds, rest: async () => rest });
    expect(rest.put).toHaveBeenCalledWith("/applications/app/guilds/7/commands", {
      body: [{ name: "ping", description: "Pong", type: 1 }],
    });
  });
});

describe("nect start", () => {
  test("needs a build and a token", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping });
    const noBuild = await nect(["start"], root, { env: { DISCORD_TOKEN: "t" } });
    expect(noBuild.code).toBe(1);
    expect(noBuild.err).toContain(".nect/manifest.json not found. Run nect build first.");

    await nect(["build"], root);
    const noToken = await nect(["start"], root);
    expect(noToken.code).toBe(1);
    expect(noToken.err).toContain("DISCORD_TOKEN is not set");
  });
});

describe("nect clean", () => {
  test("removes outDir and is fine when it is already gone", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping });
    await nect(["build"], root);
    expect(existsSync(path.join(root, ".nect"))).toBe(true);
    const first = await nect(["clean"], root);
    expect(first.out).toBe("Removed .nect/");
    expect(existsSync(path.join(root, ".nect"))).toBe(false);
    const second = await nect(["clean"], root);
    expect(second.code).toBe(0);
    expect(second.out).toContain("Nothing to remove");
  });
});

describe("nect info", () => {
  test("shows versions and the effective config", async () => {
    const result = await nect(["info"], basic, { env: { DISCORD_TOKEN: "t" } });
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/^nect +0\.0\.0$/m);
    expect(result.out).toMatch(/^node +v\d+/m);
    expect(result.out).toMatch(/^discord\.js +14\./m);
    expect(result.out).toMatch(/^DISCORD_TOKEN +set$/m);
    expect(result.out).toMatch(/^DISCORD_APPLICATION_ID +not set$/m);
    expect(result.out).toMatch(/^env +development$/m);
    expect(result.out).toMatch(/^intents +Guilds, GuildMembers$/m);
    expect(result.out).toMatch(/^registration +none$/m);
  });

  test("still works without a config", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "nect-empty-"));
    temps.push(root);
    const result = await nect(["info"], root);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/^config +No nect\.config\.ts/m);
  });
});
