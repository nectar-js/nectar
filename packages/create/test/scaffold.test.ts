import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { run } from "../../core/src/cli/index.js";
import { detectPackageManager, nextSteps, scaffold, templateFiles } from "../src/scaffold.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nect-create-"));
  temps.push(dir);
  return path.join(dir, "my-bot");
}

/**
 * Stands in for `npm install`: links the workspace's `@nect-js/core` and `discord.js` into the
 * generated project. Junctions, so no privileges are needed on Windows.
 */
function linkDependencies(dir: string): void {
  const modules = path.join(dir, "node_modules");
  mkdirSync(path.join(modules, "@nect-js"), { recursive: true });
  symlinkSync(path.join(repo, "packages/core"), path.join(modules, "@nect-js/core"), "junction");
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
  test.each(["ts", "js"] as const)("a %s project passes nect check", async (language) => {
    const dir = tempDir();
    const files = scaffold(dir, { name: "my-bot", language, packageManager: "npm" });
    expect(files).toHaveLength(language === "ts" ? 9 : 8);
    expect(files.some((f) => f.startsWith("app/components/counter/[count]/button."))).toBe(true);
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(".nect/");

    linkDependencies(dir);
    const result = await check(dir);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toBe("✔ No problems. 1 command, 1 component route, 1 event in app/.");
  });

  test("package.json has the scripts, dependencies, and name", () => {
    const files = templateFiles({ name: "bot", language: "ts", packageManager: "pnpm" });
    const pkg = JSON.parse(files["package.json"] ?? "{}");
    expect(pkg.name).toBe("bot");
    expect(pkg.scripts.dev).toBe("nect dev");
    expect(pkg.dependencies["@nect-js/core"]).toMatch(/^\^\d/);
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
    expect(existsSync(path.join(dir, "nect.config.js"))).toBe(true);
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
