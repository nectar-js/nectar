import { createDevServer } from "../dev/server.js";
import { watchTree } from "../dev/watch.js";
import { version } from "../version.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { describe, loadProject } from "./project.js";
import { block, c, fail, info, stamp } from "./ui.js";

/** `nect dev [--verbose]`: compile, register dev guild commands, run, and react to file changes. */
export async function dev(io: CliIo, verbose: boolean): Promise<number> {
  io.out(`${c.bold("nect dev")} ${c.dim(`v${version}`)}`);
  io.out("");
  const project = await loadProject(io.cwd, io.env);
  const server = createDevServer(project, io, { verbose });
  await server.start();
  io.out(
    info(
      `Watching ${c.bold(`${relative(project.root, project.appDir) || "."}/`)}, ${c.bold(relative(project.root, project.configFile))}, and the files they import. ${c.dim("Ctrl+C stops.")}`,
    ),
  );

  // Batches are handled one at a time, in order, so a rebuild never races a reload.
  let queue = Promise.resolve();
  const watcher = watchTree(
    project.root,
    (files) => {
      queue = queue
        .then(() => server.apply(files))
        .catch((error: unknown) => {
          io.err(
            `${stamp()} ${error instanceof CliError ? block(fail(error.message), error.details) : fail(describe(error))}`,
          );
        });
    },
    { onError: (error) => io.err(`${stamp()} ${fail(`Watcher error: ${error.message}`)}`) },
  );

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
  io.out("");
  io.out(info("Stopping."));
  watcher.close();
  await queue;
  await server.stop();
  return EXIT_OK;
}
