import { fileURLToPath } from "node:url";
import { main } from "./cli/index.js";

/**
 * Runs `nectar start` in the project at `root`. The `start.mjs` that `nectar build` writes calls
 * this, so a build runs with `node` alone and shard managers have a file to spawn.
 */
export async function start(root: string | URL): Promise<void> {
  process.exitCode = await main(["start"], typeof root === "string" ? root : fileURLToPath(root));
}
