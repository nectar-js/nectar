import { writeFileSync } from "node:fs";
import path from "node:path";
import { toManifest, writeManifest } from "../manifest/index.js";
import { writeTypes } from "../typegen/index.js";
import { compileProject, relative, summary } from "./compile.js";
import { type CliIo, EXIT_FAILURE, EXIT_OK } from "./io.js";
import { loadProject, type Project } from "./project.js";
import { c, ok, warn } from "./ui.js";

const START_FILE = "start.js";

/** `nectar build`: compile, then write the manifest, generated types, and `start.js` into `outDir`. */
export async function build(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;

  const manifestFile = writeManifest(toManifest(graph, project.outDir), project.outDir);
  const typesFile = writeTypes(graph, project.outDir, project.config.plugins);
  const startFile = writeStart(project);
  io.out(ok(`Built ${summary(graph)}.`));
  for (const file of [manifestFile, typesFile, startFile]) {
    io.out(`  ${c.dim(relative(project.root, file))}`);
  }
  return EXIT_OK;
}

/**
 * `node .nectar/start.js` does what `nectar start` does, from any working directory. It is the
 * file to hand a ShardingManager or cluster manager: each shard loads the manifest itself and
 * none of them registers commands.
 */
function writeStart(project: Project): string {
  const root = path.relative(project.outDir, project.root).split(path.sep).join("/");
  const file = path.join(project.outDir, START_FILE);
  writeFileSync(
    file,
    [
      "// Written by nectar build. Runs the bot from this build, like `nectar start`.",
      'import { start } from "@nectar-js/nectar/start";',
      "",
      `await start(new URL(${JSON.stringify(`${root || "."}/`)}, import.meta.url));`,
      "",
    ].join("\n"),
  );
  return file;
}

/** `nectar check`: compile and report, writing nothing. */
export async function check(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  const warnings = graph.diagnostics.items.length;
  io.out(
    warnings === 0
      ? ok(
          `No problems. ${summary(graph)} in ${path.relative(project.root, project.appDir) || "."}/.`,
        )
      : warn(`${warnings} warning${warnings === 1 ? "" : "s"}, no errors.`),
  );
  return EXIT_OK;
}
