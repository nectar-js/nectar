import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildGraph } from "../src/compiler/index.js";
import { classifyPath, diffManifests } from "../src/dev/classify.js";
import { toManifest } from "../src/manifest/index.js";
import { makeApp } from "./helpers.js";

const root = path.resolve("/proj");
const project = {
  configFile: path.join(root, "nect.config.ts"),
  appDir: path.join(root, "app"),
  outDir: path.join(root, ".nect"),
};
const kind = (rel: string) => classifyPath(path.join(root, ...rel.split("/")), project);

describe("classifyPath", () => {
  test("config file", () => {
    expect(kind("nect.config.ts")).toBe("config");
  });

  test("reserved files and directories under the app directory are route changes", () => {
    expect(kind("app/commands/ping/command.ts")).toBe("route");
    expect(kind("app/middleware.js")).toBe("route");
    expect(kind("app/components/x/[id]/select.ts")).toBe("route");
    expect(kind("app/commands/ping")).toBe("route");
    expect(kind("app/commands/(group)")).toBe("route");
  });

  test("other source files are dependencies, wherever they live", () => {
    expect(kind("app/lib/db.ts")).toBe("dependency");
    expect(kind("app/commands/ping/helpers.ts")).toBe("dependency");
    expect(kind("src/shared.js")).toBe("dependency");
    expect(kind("data.json")).toBe("dependency");
  });

  test("output, node_modules, git, tests, and non-source files are ignored", () => {
    expect(kind(".nect/manifest.json")).toBe("ignored");
    expect(kind("node_modules/x/index.js")).toBe("ignored");
    expect(kind(".git/index")).toBe("ignored");
    expect(kind("app/commands/ping/command.test.ts")).toBe("ignored");
    expect(kind("README.md")).toBe("ignored");
    expect(kind(".env")).toBe("ignored");
    expect(kind("src")).toBe("ignored");
  });
});

describe("diffManifests", () => {
  const ping = (body: string, description = "Pong") =>
    `export const meta = { description: "${description}" };\nexport default async function () { ${body} }\n`;

  async function manifest(files: Record<string, string>) {
    const app = makeApp(files);
    return toManifest(await buildGraph(app), app);
  }

  test("a handler body change is neither structure nor commands", async () => {
    const a = await manifest({ "commands/ping/command.ts": ping("return 1;") });
    const b = await manifest({ "commands/ping/command.ts": ping("return 2;") });
    expect(diffManifests(a, b)).toEqual({ structure: false, commands: false });
  });

  test("metadata changes commands only", async () => {
    const a = await manifest({ "commands/ping/command.ts": ping("") });
    const b = await manifest({ "commands/ping/command.ts": ping("", "Ping!") });
    expect(diffManifests(a, b)).toEqual({ structure: false, commands: true });
  });

  test("a new middleware changes structure only, a new command changes both", async () => {
    const a = await manifest({ "commands/ping/command.ts": ping("") });
    const b = await manifest({
      "commands/ping/command.ts": ping(""),
      "middleware.ts": "export default async function (ctx, next) { return next(); }\n",
    });
    expect(diffManifests(a, b)).toEqual({ structure: true, commands: false });
    const c = await manifest({
      "commands/ping/command.ts": ping(""),
      "commands/pong/command.ts": ping(""),
    });
    expect(diffManifests(a, c)).toEqual({ structure: true, commands: true });
  });
});
