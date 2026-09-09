import { existsSync } from "node:fs";
import path from "node:path";
import { loadManifest, MANIFEST_FILE } from "../manifest/index.js";
import { createRuntime } from "../runtime/index.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";
import { TOKEN_VAR } from "./sync.js";

/** `neat start`: run the bot from the last `neat build`. No source discovery happens here. */
export async function start(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const manifestFile = path.join(project.outDir, MANIFEST_FILE);
  if (!existsSync(manifestFile)) {
    throw new CliError(`${relative(project.root, manifestFile)} not found. Run neat build first.`);
  }
  const token = io.env[TOKEN_VAR];
  if (token === undefined || token === "") {
    throw new CliError(`${TOKEN_VAR} is not set. Put it in .env or the environment.`);
  }

  const { manifest, appDir } = loadManifest(manifestFile);
  const runtime = createRuntime({ manifest, appDir, config: project.config, env: project.env });
  runtime.client.once("clientReady", () => {
    io.out(`Logged in as ${runtime.client.user?.tag ?? "unknown"} (${project.env}).`);
  });
  await runtime.start({ token });
  return EXIT_OK;
}
