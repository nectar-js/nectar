# Nectar

A filesystem-based meta-framework for discord.js.

- Handlers take their route path as the first argument (`defineCommand("user/profile", ...)`), and the compiler checks it against the file's location. Moving a file means editing that string.
- Tests assert against `examples/basic`, `examples/javascript`, and `examples/tickets`. Changing their routes means updating those tests.
- The root `README.md` and the package `LICENSE` files are symlinks. Edit `packages/nectar/README.md` and the root `LICENSE`.

## Verify

`pnpm lint && pnpm build && pnpm --filter basic run build && pnpm --filter javascript run build && pnpm --filter tickets run build && pnpm test && pnpm typecheck`
