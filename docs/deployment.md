# Deploying

`nectar build` compiles the app into `.nectar/`. Production runs that build and never scans `app/` for routes.

```bash
npm ci --omit=dev
npx nectar build
NODE_ENV=production node .nectar/start.mjs
```

`node .nectar/start.mjs` does the same as `nectar start`. It finds the project from its own location, so it works from any directory, and it loads `.env` from the project root if there is one. Point a discord.js `ShardingManager` or a cluster manager at the same file: `new ShardingManager(".nectar/start.mjs")`. Each shard loads the build itself.

The server needs:

- Node.js 22.18 or newer. TypeScript handlers run as they are; Node strips the types when it imports them.
- The project: `app/`, `nectar.config.ts`, `package.json`, production dependencies, and `.nectar/`.
- `DISCORD_TOKEN`, in the environment or in `.env`.

`.nectar/` refers to the project with relative paths, so you can build in CI and ship `.nectar/` with the rest.

With `NODE_ENV=production`, Nectar imports every handler at startup. A file that fails to load stops the bot from starting, rather than failing the first interaction that uses it.

## Registering commands

Run `nectar sync` once per release. Starting the bot never registers commands, however many processes or shards you run.

```bash
NODE_ENV=production npx nectar sync
```

It needs `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`. In production it registers globally, or to the guilds in `commands.target`. It only writes when something changed, and `--dry-run` prints the diff without writing.

## Stopping

On SIGTERM or SIGINT, Nectar stops taking interactions, waits up to 10 seconds for the running ones, and disconnects. Give your process manager a longer stop timeout than that. The examples below do.

## Docker

```dockerfile
FROM node:22-slim
WORKDIR /bot
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx nectar build
CMD ["node", ".nectar/start.mjs"]
```

Keep local files out of the image with a `.dockerignore`:

```
node_modules
.nectar
.env
```

```bash
docker build -t my-bot .
docker run --rm --env-file .env my-bot npx nectar sync
docker run -d --name my-bot --env-file .env --stop-timeout 15 my-bot
```

Use the exec form of `CMD`, as above. The shell form runs Node under `/bin/sh`, which does not pass `docker stop`'s SIGTERM on.

## PM2

```bash
NODE_ENV=production pm2 start .nectar/start.mjs --name my-bot --kill-timeout 15000
```

PM2 stops a process with SIGINT and kills it 1.6 seconds later unless `--kill-timeout` says otherwise.

## systemd

```ini
# /etc/systemd/system/my-bot.service
[Unit]
Description=my-bot
After=network-online.target
Wants=network-online.target

[Service]
User=bot
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /srv/my-bot/.nectar/start.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now my-bot
journalctl -u my-bot -f
```

systemd waits 90 seconds after SIGTERM before it kills the process, so the default is long enough.
