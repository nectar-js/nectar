import { existsSync } from "node:fs";
import path from "node:path";
import type { Client } from "discord.js";
import { loadManifest, MANIFEST_FILE } from "../manifest/index.js";
import { createRuntime, LoginError } from "../runtime/index.js";
import { relative } from "./compile.js";
import { CliError, type CliIo, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";
import { credential, loginFailure } from "./sync.js";
import { c, ok } from "./ui.js";

/** `nectar start`: run the bot from the last `nectar build`. No source discovery happens here. */
export async function start(io: CliIo): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const manifestFile = path.join(project.outDir, MANIFEST_FILE);
  if (!existsSync(manifestFile)) {
    throw new CliError(`${relative(project.root, manifestFile)} not found.`, {
      details: [`Run ${c.bold("nectar build")} first, then ${c.bold("nectar start")} again.`],
    });
  }
  const token = credential(project, io, "token");

  const { manifest, appDir } = loadManifest(manifestFile);
  const runtime = createRuntime({
    manifest,
    appDir,
    config: project.config,
    env: project.env,
    ...(io.client === undefined ? {} : { client: io.client(project.config) }),
  });
  runtime.client.once("clientReady", (client) => {
    io.out(ok(`Logged in as ${c.bold(client.user.tag)} (${project.env}${shards(client)}).`));
  });
  try {
    await runtime.start({ token });
  } catch (error) {
    throw error instanceof LoginError ? loginFailure(error, project) : error;
  }
  return EXIT_OK;
}

/** `, shard 2 of 4` when the bot is sharded, so each shard process's line says which it is. */
function shards(client: Client): string {
  const { shards: ids, shardCount } = client.options;
  if (!Array.isArray(ids) || shardCount === undefined || shardCount < 2) return "";
  return `, shard${ids.length === 1 ? "" : "s"} ${ids.join(", ")} of ${shardCount}`;
}
