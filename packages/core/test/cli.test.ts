import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { type CliIo, run } from "../src/cli/index.js";
import { version } from "../src/version.js";

const basic = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/basic");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway project: a plain-object config plus the given app files. */
export function makeProject(files: Record<string, string>, config = "{ intents: [] }"): string {
  const root = mkdtempSync(path.join(tmpdir(), "neat-cli-"));
  temps.push(root);
  writeFileSync(path.join(root, "neat.config.js"), `export default ${config};\n`);
  mkdirSync(path.join(root, "app"));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, "app", ...relative.split("/"));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

export async function neat(
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

describe("neat", () => {
  test("help and version", async () => {
    const bare = await neat([], basic);
    expect(bare.code).toBe(2);
    expect(bare.out).toContain("Usage: neat <command>");
    expect((await neat(["--help"], basic)).code).toBe(0);
    expect((await neat(["--version"], basic)).out).toBe(version);
    expect((await neat(["build", "--help"], basic)).out).toContain("Usage: neat build");
  });

  test("unknown commands and flags exit 2", async () => {
    const unknown = await neat(["frobnicate"], basic);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('Unknown command "frobnicate"');
    const flag = await neat(["build", "--nope"], basic);
    expect(flag.code).toBe(2);
    expect(flag.err).toContain("--nope");
  });

  test("missing config is a clear failure", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "neat-empty-"));
    temps.push(root);
    const result = await neat(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("No neat.config.ts in");
  });

  test("invalid config names the field", async () => {
    const root = makeProject({}, "{ intents: [], dev: { guilds: ['x'] } }");
    const result = await neat(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("`dev.guilds`");
  });
});

describe("neat check", () => {
  test("examples/basic passes", async () => {
    const result = await neat(["check"], basic);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(result.out).toBe("No problems. 3 commands, 4 component routes, 2 events in app/.");
  });

  test("reports diagnostics with file and code, writes nothing", async () => {
    const root = makeProject({
      "commands/ping/command.ts": ping,
      "commands/Bad Name/command.ts": ping,
    });
    const result = await neat(["check"], root);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^error\[[a-z-]+\] app\/commands\/Bad Name/m);
    expect(result.err).toContain("1 error.");
    expect(existsSync(path.join(root, ".neat"))).toBe(false);
  });
});

describe("neat build", () => {
  test("writes the manifest and types into outDir", async () => {
    const root = makeProject(
      { "commands/ping/command.ts": ping },
      '{ intents: [], outDir: "build/neat" }',
    );
    const result = await neat(["build"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Built 1 command, 0 component routes, 0 events.");
    expect(result.out).toContain("build/neat/manifest.json");
    const manifest = JSON.parse(readFileSync(path.join(root, "build/neat/manifest.json"), "utf8"));
    expect(manifest.appDir).toBe("../../app");
    expect(manifest.commands.map((c: { name: string }) => c.name)).toEqual(["ping"]);
    expect(readFileSync(path.join(root, "build/neat/types.d.ts"), "utf8")).toContain('"ping"');
  });

  test("fails without writing when the app is invalid", async () => {
    const root = makeProject({ "commands/ping/command.ts": "export default 1;\n" });
    const result = await neat(["build"], root);
    expect(result.code).toBe(1);
    expect(existsSync(path.join(root, ".neat"))).toBe(false);
  });
});

describe("neat routes", () => {
  test("examples/basic tree", async () => {
    const result = await neat(["routes"], basic);
    expect(result.code).toBe(0);
    expect(result.out).toMatchSnapshot();
  });
});

describe("neat manifest", () => {
  test("prints the manifest", async () => {
    const result = await neat(["manifest"], basic);
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
    const ban = await neat(["manifest", "--route", "command:moderation/ban"], basic);
    expect(ban.code).toBe(0);
    const [detail] = JSON.parse(ban.out);
    expect(detail.file).toBe("commands/moderation/ban/command.ts");
    expect(detail.middleware).toEqual(["middleware.ts", "commands/moderation/middleware.ts"]);
    expect(detail.errors).toEqual(["error.ts"]);
    expect(detail.command).toMatchObject({ name: "moderation", position: "ban" });
    expect(detail.command.payload.name).toBe("moderation");

    const byPath = await neat(["manifest", "--route", "pagination/[page]/next"], basic);
    const [button] = JSON.parse(byPath.out);
    expect(button.customId).toMatch(/^n:[a-z0-9]{6}:<page>$/);

    const both = await neat(["manifest", "--route", "command:user/profile"], basic);
    const details = JSON.parse(both.out);
    expect(details.map((d: { kind: string }) => d.kind)).toEqual(["autocomplete", "command"]);
    expect(details[0].commandRoute).toBe("commands/user/profile/command.ts");

    const event = await neat(["manifest", "--route", "event:guildMemberAdd/(welcome)"], basic);
    expect(JSON.parse(event.out)[0].eventHandlers.handlers).toHaveLength(2);
  });

  test("unknown route lists the known ones", async () => {
    const result = await neat(["manifest", "--route", "nope"], basic);
    expect(result.code).toBe(1);
    expect(result.err).toContain('No route "nope"');
    expect(result.err).toContain("  command:ping");
  });
});
