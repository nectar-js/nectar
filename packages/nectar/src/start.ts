import { fileURLToPath } from "node:url";
import { main } from "./cli/index.js";

/**
 * Runs `nectar start` in the project at `root`. The `start.mjs` that `nectar build` writes calls
 * this, so a build runs with `node` alone and shard managers have a file to spawn.
 */
export async function start(root: string | URL): Promise<void> {
  // A ShardingManager with no token of its own sets DISCORD_TOKEN="null" for its shards, and
  // .env never overrides a variable that is already set. Without this, `.env` would be ignored.
  if (process.env.SHARDING_MANAGER === "true" && process.env.DISCORD_TOKEN === "null") {
    delete process.env.DISCORD_TOKEN;
  }
  process.exitCode = await main(["start"], typeof root === "string" ? root : fileURLToPath(root));
}
