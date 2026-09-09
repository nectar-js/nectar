import { createDevServer } from "../dev/server.js";
import { watchTree } from "../dev/watch.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { describe, loadProject } from "./project.js";

/** `neat dev [--verbose]`: compile, register dev guild commands, run, and react to file changes. */
export async function dev(io: CliIo, verbose: boolean): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const server = createDevServer(project, io, { verbose });
  await server.start();
  io.out(
    `Watching ${relative(project.root, project.appDir) || "."}/, ${relative(project.root, project.configFile)}, and the files they import.`,
  );

  // Batches are handled one at a time, in order, so a rebuild never races a reload.
  let queue = Promise.resolve();
  const watcher = watchTree(
    project.root,
    (files) => {
      queue = queue
        .then(() => server.apply(files))
        .catch((error: unknown) => {
          io.err(error instanceof CliError ? error.message : describe(error));
        });
    },
    { onError: (error) => io.err(`Watcher error: ${error.message}`) },
  );

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
  io.out("Stopping.");
  watcher.close();
  await queue;
  await server.stop();
  return EXIT_OK;
}
