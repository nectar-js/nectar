import path from "node:path";
import { toManifest, writeManifest } from "../manifest/index.js";
import { writeTypes } from "../typegen/index.js";
import { compileProject, relative, summary } from "./compile.js";
import { type CliIo, EXIT_FAILURE, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";

/** `neat build`: compile, then write the manifest and generated types into `outDir`. */
export async function build(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;

  const manifestFile = writeManifest(toManifest(graph, project.outDir), project.outDir);
  const typesFile = writeTypes(graph, project.outDir);
  io.out(`Built ${summary(graph)}.`);
  io.out(`  ${relative(project.root, manifestFile)}`);
  io.out(`  ${relative(project.root, typesFile)}`);
  return EXIT_OK;
}

/** `neat check`: compile and report, writing nothing. */
export async function check(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  const warnings = graph.diagnostics.items.length;
  io.out(
    warnings === 0
      ? `No problems. ${summary(graph)} in ${path.relative(project.root, project.appDir) || "."}/.`
      : `${warnings} warning${warnings === 1 ? "" : "s"}, no errors.`,
  );
  return EXIT_OK;
}
