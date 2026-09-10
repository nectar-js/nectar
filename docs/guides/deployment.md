# Deploying

```bash
npm ci --omit=dev
npx nectar build
NODE_ENV=production node .nectar/start.mjs
```

`node .nectar/start.mjs` is the same as `nectar start`. It works from any directory and loads `.env` from the project root. To run it under a `ShardingManager`, see [Sharding](./sharding).

The server needs:

- Node.js 22.18 or newer
- `app/`, `nectar.config.ts`, `package.json`, production dependencies, and `.nectar/`
- `DISCORD_TOKEN`, in the environment or in `.env`

`.nectar/` only contains relative paths, so you can build in CI and ship it with the project.

## Registering commands

The bot doesn't register commands when it starts. Run `nectar sync` once per release:

```bash
NODE_ENV=production npx nectar sync
```

This needs `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID`.

## Stopping

On SIGTERM or SIGINT, the bot waits up to 10 seconds for running interactions, then disconnects. Set your process manager's stop timeout higher than that.

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

`.dockerignore`:

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

Keep the exec form of `CMD`. With the shell form, Node doesn't receive the SIGTERM from `docker stop`.

## PM2

```bash
NODE_ENV=production pm2 start .nectar/start.mjs --name my-bot --kill-timeout 15000
```

Without `--kill-timeout`, PM2 kills the process 1.6 seconds after SIGINT.

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

systemd's default stop timeout is 90 seconds, which is long enough.
