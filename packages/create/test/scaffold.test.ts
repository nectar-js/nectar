import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { run } from "../../nectar/src/cli/index.js";
import { detectPackageManager, nextSteps, scaffold, templateFiles } from "../src/scaffold.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nectar-create-"));
  temps.push(dir);
  return path.join(dir, "my-bot");
}

/**
 * Stands in for `npm install`: links the workspace's `@nectar-js/nectar` and `discord.js` into the
 * generated project. Junctions, so no privileges are needed on Windows.
 */
function linkDependencies(dir: string): void {
  const modules = path.join(dir, "node_modules");
  mkdirSync(path.join(modules, "@nectar-js"), { recursive: true });
  symlinkSync(
    path.join(repo, "packages/nectar"),
    path.join(modules, "@nectar-js/nectar"),
    "junction",
  );
  symlinkSync(
    realpathSync(path.join(repo, "examples/basic/node_modules/discord.js")),
    path.join(modules, "discord.js"),
    "junction",
  );
}

async function check(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["check"], {
    cwd,
    env: {},
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("scaffold", () => {
  test.each(["ts", "js"] as const)("a %s project passes nectar check", async (language) => {
    const dir = tempDir();
    const files = scaffold(dir, { name: "my-bot", language, packageManager: "npm" });
    expect(files).toHaveLength(language === "ts" ? 9 : 8);
    expect(files.some((f) => f.startsWith("app/components/counter/[count]/button."))).toBe(true);
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(".nectar/");

    linkDependencies(dir);
    const result = await check(dir);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toBe("✔ No problems. 1 command, 1 component route, 1 event in app/.");
  });

  test("a ts project type-checks with a local .ts import", async () => {
    const dir = tempDir();
    scaffold(dir, { name: "my-bot", language: "ts", packageManager: "npm" });
    linkDependencies(dir);
    mkdirSync(path.join(dir, "node_modules/@types"), { recursive: true });
    symlinkSync(
      realpathSync(path.join(repo, "node_modules/@types/node")),
      path.join(dir, "node_modules/@types/node"),
      "junction",
    );
    // Node runs the files as they are, so local imports keep their .ts extension.
    writeFileSync(path.join(dir, "app/greeting.ts"), 'export const greeting = "Pong";\n');
    const ping = path.join(dir, "app/commands/ping/command.ts");
    const source = readFileSync(ping, "utf8");
    writeFileSync(
      ping,
      `import { greeting } from "../../greeting.ts";\n${source}\nexport const text: string = greeting;\n`,
    );

    const io = { cwd: dir, env: {}, out: () => {}, err: () => {} };
    expect(await run(["build"], io)).toBe(0);
    const tsc = spawnSync(
      process.execPath,
      [path.join(repo, "node_modules/typescript/bin/tsc"), "-p", dir],
      { encoding: "utf8" },
    );
    expect(tsc.stdout + tsc.stderr).toBe("");
    expect(tsc.status).toBe(0);
  });

  test("package.json has the scripts, dependencies, and name", () => {
    const files = templateFiles({ name: "bot", language: "ts", packageManager: "pnpm" });
    const pkg = JSON.parse(files["package.json"] ?? "{}");
    expect(pkg.name).toBe("bot");
    expect(pkg.scripts.dev).toBe("nectar dev");
    expect(pkg.dependencies["@nectar-js/nectar"]).toMatch(/^\^\d/);
    expect(pkg.dependencies["discord.js"]).toMatch(/^\^14/);
    expect(pkg.devDependencies.typescript).toBeDefined();
    expect(
      JSON.parse(
        templateFiles({ name: "bot", language: "js", packageManager: "npm" })["package.json"] ??
          "{}",
      ).devDependencies,
    ).toBeUndefined();
  });

  test("refuses a non-empty directory", () => {
    const dir = tempDir();
    scaffold(dir, { name: "my-bot", language: "js", packageManager: "npm" });
    expect(() => scaffold(dir, { name: "my-bot", language: "js", packageManager: "npm" })).toThrow(
      "not empty",
    );
    expect(existsSync(path.join(dir, "nectar.config.js"))).toBe(true);
  });

  test("package manager detection and next steps", () => {
    expect(detectPackageManager("pnpm/10.0.0 npm/? node/v22")).toBe("pnpm");
    expect(detectPackageManager("npm/10.0.0 node/v22")).toBe("npm");
    expect(detectPackageManager(undefined)).toBe("npm");
    const steps = nextSteps("my-bot", { name: "my-bot", language: "ts", packageManager: "pnpm" });
    expect(steps).toContain("cd my-bot");
    expect(steps).toContain("pnpm install");
    expect(steps).toContain("pnpm dev");
    expect(nextSteps("x", { name: "x", language: "ts", packageManager: "npm" })).toContain(
      "npm run dev",
    );
  });
});
