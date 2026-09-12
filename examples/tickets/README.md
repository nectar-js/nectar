# tickets

A support ticket bot. `/ticket open` creates a ticket and posts it with a close button and an assign menu, `/ticket list` shows what is open, and a plugin prunes tickets a week after they close.

Tickets are stored with `node:sqlite` in `tickets.db` next to the config. Node prints an experimental warning when it loads, on startup and during `nectar build`.

```bash
pnpm install
pnpm build
cp .env.example .env   # fill in the token, application ID, and a dev guild
pnpm nectar dev
```

The tests run every route against an in-memory database: `pnpm vitest run examples/tickets` from the repository root, after `pnpm build`.

`Dockerfile` builds the bot from the repository root: `docker build -f examples/tickets/Dockerfile -t tickets .`
