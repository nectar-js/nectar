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

export async function nectar(
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

describe("nectar", () => {
  test("help and version", async () => {
    const bare = await nectar([], basic);
    expect(bare.code).toBe(2);
    expect(bare.out).toContain("Usage: nectar <command>");
    expect((await nectar(["--help"], basic)).code).toBe(0);
    expect((await nectar(["--version"], basic)).out).toBe(version);
    expect((await nectar(["build", "--help"], basic)).out).toContain("Usage: nectar build");
  });

  test("unknown commands and flags exit 2", async () => {
    const unknown = await nectar(["frobnicate"], basic);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('Unknown command "frobnicate"');
    const flag = await nectar(["build", "--nope"], basic);
    expect(flag.code).toBe(2);
    expect(flag.err).toContain("--nope");
  });

  test("missing config is a clear failure", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "nectar-empty-"));
    temps.push(root);
    const result = await nectar(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("No nectar.config.ts in");
  });

  test("invalid config names the field", async () => {
    const root = makeProject({}, "{ intents: [], dev: { guilds: ['x'] } }");
    const result = await nectar(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("`dev.guilds`");
    const token = await nectar(["check"], makeProject({}, "{ intents: [], token: 1 }"));
    expect(token.code).toBe(1);
    expect(token.err).toContain("`token` must be a string");
  });

  test("credentials come from the config first, then the environment", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], token: "from-config", applicationId: "cfg-app", dev: { guilds: ["1"] } }',
    );
    const rest = fakeRest();
    let seenToken = "";
    const result = await nectar(["sync"], root, {
      env: { DISCORD_TOKEN: "from-env" },
      rest: async (token) => {
        seenToken = token;
        return rest;
      },
    });
    expect(result.code).toBe(0);
    expect(seenToken).toBe("from-config");
    expect(rest.put).toHaveBeenCalledWith("/applications/cfg-app/guilds/1/commands", {
      body: [{ name: "ping", description: "Pong", type: 1 }],
    });

    const empty = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], token: "", dev: { guilds: ["1"] } }',
    );
    const missing = await nectar(["sync"], empty, { env: {} });
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("DISCORD_TOKEN is not set.");
    expect(missing.err).toContain("token: process.env.DISCORD_TOKEN");
  });
});

describe("nectar check", () => {
  test("examples/basic passes", async () => {
    const result = await nectar(["check"], basic);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(result.out).toBe("✔ No problems. 3 commands, 4 component routes, 2 events in app/.");
  });

  test("reports diagnostics with file and code, writes nothing", async () => {
    const root = makeProject({
      "commands/ping/command.ts": ping,
      "commands/Bad Name/command.ts": ping,
    });
    const result = await nectar(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^✖ error {2}[a-z-]+ {2}app\/commands\/Bad Name/m);
    expect(result.err).toContain("1 error.");
    expect(existsSync(path.join(root, ".nectar"))).toBe(false);
  });
});

describe("nectar build", () => {
  test("writes the manifest and types into outDir", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], outDir: "build/nectar" }',
    );
    const result = await nectar(["build"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Built 1 command, 0 component routes, 0 events.");
    expect(result.out).toContain("build/nectar/manifest.json");
    const manifest = JSON.parse(
      readFileSync(path.join(root, "build/nectar/manifest.json"), "utf8"),
    );
    expect(manifest.appDir).toBe("../../app");
    expect(manifest.commands.map((c: { name: string }) => c.name)).toEqual(["ping"]);
    expect(readFileSync(path.join(root, "build/nectar/types.d.ts"), "utf8")).toContain('"ping"');
  });

  test("fails without writing when the app is invalid", async () => {
    const root = makeProject({ "commands/ping/command.ts": "export default 1;\n" });
    const result = await nectar(["build"], root);
    expect(result.code).toBe(1);
    expect(existsSync(path.join(root, ".nectar"))).toBe(false);
  });
});

describe("nectar routes", () => {
  test("examples/basic tree", async () => {
    const result = await nectar(["routes"], basic);
    expect(result.code).toBe(0);
    expect(result.out).toMatchSnapshot();
  });
});

describe("nectar manifest", () => {
  test("prints the manifest", async () => {
    const result = await nectar(["manifest"], basic);
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
    const ban = await nectar(["manifest", "--route", "command:moderation/ban"], basic);
    expect(ban.code).toBe(0);
    const [detail] = JSON.parse(ban.out);
    expect(detail.file).toBe("commands/moderation/ban/command.ts");
    expect(detail.middleware).toEqual(["middleware.ts", "commands/moderation/middleware.ts"]);
    expect(detail.errors).toEqual(["error.ts"]);
    expect(detail.command).toMatchObject({ name: "moderation", position: "ban" });
    expect(detail.command.payload.name).toBe("moderation");

    const byPath = await nectar(["manifest", "--route", "pagination/[page]/next"], basic);
    const [button] = JSON.parse(byPath.out);
    expect(button.customId).toMatch(/^n:[a-z0-9]{6}:<page>$/);

    const both = await nectar(["manifest", "--route", "command:user/profile"], basic);
    const details = JSON.parse(both.out);
    expect(details.map((d: { kind: string }) => d.kind)).toEqual(["autocomplete", "command"]);
    expect(details[0].commandRoute).toBe("commands/user/profile/command.ts");

    const event = await nectar(["manifest", "--route", "event:guildMemberAdd/(welcome)"], basic);
    expect(JSON.parse(event.out)[0].eventHandlers.handlers).toHaveLength(2);
  });

  test("unknown route lists the known ones", async () => {
    const result = await nectar(["manifest", "--route", "nope"], basic);
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

describe("nectar sync", () => {
  const creds = { DISCORD_TOKEN: "t", DISCORD_APPLICATION_ID: "app" };
  const devConfig = '{ intents: [], dev: { guilds: ["1"] } }';

  test("needs credentials and a target", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const noToken = await nectar(["sync"], root, { env: { DISCORD_APPLICATION_ID: "app" } });
    expect(noToken.code).toBe(1);
    expect(noToken.err).toContain("DISCORD_TOKEN is not set");
    expect(noToken.err).toContain("https://discord.com/developers/applications");

    const noTarget = await nectar(["sync"], makeProject({ "commands/ping/command.ts": ping }), {
      env: creds,
    });
    expect(noTarget.code).toBe(1);
    expect(noTarget.err).toContain("No registration target for development");
  });

  test("registers, then a second run is a cache hit", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const rest = fakeRest();
    const io = { env: creds, rest: async () => rest };

    const first = await nectar(["sync"], root, io);
    expect(first.code).toBe(0);
    expect(first.out).toBe("✔ guild:1: +ping (applied)");
    expect(rest.put).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(root, ".nectar/registration.json"))).toBe(true);

    const second = await nectar(["sync"], root, io);
    expect(second.out).toBe("✔ guild:1: unchanged since last sync.");
    expect(rest.get).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledTimes(1);
  });

  test("dry run reports without writing, and the guard needs --force", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping }, devConfig);
    const rest = fakeRest();
    const io = { env: creds, rest: async () => rest };

    const dry = await nectar(["sync", "--dry-run"], root, io);
    expect(dry.code).toBe(0);
    expect(dry.out).toBe("› guild:1: +ping (would apply)");
    expect(rest.put).not.toHaveBeenCalled();

    await nectar(["sync"], root, io);
    rmSync(path.join(root, "app/commands"), { recursive: true });
    const refused = await nectar(["sync"], root, io);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("Refusing to register commands");
    expect(rest.put).toHaveBeenCalledTimes(1);

    const forced = await nectar(["sync", "--force"], root, io);
    expect(forced.code).toBe(0);
    expect(forced.out).toBe("✔ guild:1: -ping (applied)");
    expect(forced.err).toContain("Forced past the safety guard");
  });

  test("production goes to commands.target", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], env: "production", commands: { target: ["7"] } }',
    );
    const rest = fakeRest();
    await nectar(["sync"], root, { env: creds, rest: async () => rest });
    expect(rest.put).toHaveBeenCalledWith("/applications/app/guilds/7/commands", {
      body: [{ name: "ping", description: "Pong", type: 1 }],
    });
  });
});

describe("nectar start", () => {
  test("needs a build and a token", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping });
    const noBuild = await nectar(["start"], root, { env: { DISCORD_TOKEN: "t" } });
    expect(noBuild.code).toBe(1);
    expect(noBuild.err).toContain(".nectar/manifest.json not found.");
    expect(noBuild.err).toContain("nectar build");

    await nectar(["build"], root);
    const noToken = await nectar(["start"], root);
    expect(noToken.code).toBe(1);
    expect(noToken.err).toContain("DISCORD_TOKEN is not set");
    expect(noToken.err).toContain("https://discord.com/developers/applications");
  });
});

describe("nectar clean", () => {
  test("removes outDir and is fine when it is already gone", async () => {
    const root = makeProject({ "commands/ping/command.ts": ping });
    await nectar(["build"], root);
    expect(existsSync(path.join(root, ".nectar"))).toBe(true);
    const first = await nectar(["clean"], root);
    expect(first.out).toBe("✔ Removed .nectar/");
    expect(existsSync(path.join(root, ".nectar"))).toBe(false);
    const second = await nectar(["clean"], root);
    expect(second.code).toBe(0);
    expect(second.out).toContain("Nothing to remove");
  });
});

describe("nectar info", () => {
  test("shows versions and the effective config", async () => {
    const result = await nectar(["info"], basic, { env: { DISCORD_TOKEN: "t" } });
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/^nectar +0\.0\.0$/m);
    expect(result.out).toMatch(/^node +v\d+/m);
    expect(result.out).toMatch(/^discord\.js +14\./m);
    expect(result.out).toMatch(/^DISCORD_TOKEN +set$/m);
    expect(result.out).toMatch(/^DISCORD_APPLICATION_ID +not set$/m);
    expect(result.out).toMatch(/^env +development$/m);
    expect(result.out).toMatch(/^intents +Guilds, GuildMembers$/m);
    expect(result.out).toMatch(/^registration +none$/m);
  });

  test("still works without a config", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "nectar-empty-"));
    temps.push(root);
    const result = await nectar(["info"], root);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/^config +No nectar\.config\.ts/m);
  });
});
