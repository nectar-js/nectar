# tickets

A support ticket bot. `/ticket open` creates a private `ticket-<id>` channel that only the opener and the bot can see, and posts a card there with a close button and an assign menu. Assigning lets the assignee into the channel. Closing asks for a reason and deletes the channel. `/ticket list` shows what is open, and a plugin prunes tickets a week after they close.

Tickets are stored with `node:sqlite` in `tickets.db` next to the config. Node prints an experimental warning when it loads, on startup and during `nectar build`.

The bot needs the Manage Channels permission. Set `TICKETS_CATEGORY_ID` to put ticket channels under a category.

```bash
pnpm install
pnpm build
cp .env.example .env   # fill in the token, application ID, and a dev guild
pnpm nectar dev
```

The tests run every route against an in-memory database and a stubbed guild: `pnpm vitest run examples/tickets` from the repository root, after `pnpm build`.

`Dockerfile` builds the bot from the repository root: `docker build -f examples/tickets/Dockerfile -t tickets .`
