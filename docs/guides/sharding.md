# Sharding

`.nectar/start.mjs` works as a discord.js shard file. Build first, then point a `ShardingManager` at it:

```js
// shards.mjs
import { ShardingManager } from "discord.js";

const manager = new ShardingManager(".nectar/start.mjs");
await manager.spawn();
```

```bash
npx nectar build
NODE_ENV=production node --env-file=.env shards.mjs
```

The manager uses `DISCORD_TOKEN` to fetch the recommended shard count and passes it to each shard. If you set `totalShards` and the manager has no token, each shard reads it from `.env` or the config instead.

Each shard process loads the config and manifest on its own, and its login line names its shard:

```
✔ Logged in as my-bot#1234 (production, shard 0 of 2).
```

`ctx.client.shard` is discord.js's `ShardClientUtil`, so `broadcastEval` and `fetchClientValues` work as usual.

## What runs where

- Plugin `start` and `stop` hooks run in every shard process.
- `startGlobal` and `stopGlobal` run only in the process that runs shard 0.
- Shards never register commands. Run `nectar sync` once per release.

When the manager exits, every shard process stops and exits.

## Clustering

Libraries that run several shards per process pass the shard list and count as discord.js client options. Set those through `client` in the config. The process whose `shards` include `0` runs `startGlobal` and `stopGlobal`.
