# Nectar

A filesystem-based meta-framework for discord.js. `packages/nectar` holds the compiler, runtime, and CLI. `packages/create` scaffolds new projects.

## Working here

- Handlers take their route path as the first argument (`defineCommand("user/profile", ...)`) and the compiler checks it against the file's location. Moving a file means editing that string.
- `examples/basic` is the compiler fixture. Tests assert against it, so editing it changes test expectations.
- `examples/basic` is tested and type-checked against its generated `.nectar/`. Run `pnpm --filter basic exec nectar build` after touching routes, then `pnpm test` and `pnpm typecheck`.
- The root `README.md` and the per-package `LICENSE` files are symlinks. Edit `packages/nectar/README.md` and the root `LICENSE`.
- `.plan/` is local and gitignored. When it is present, read `SPEC.md` and `CONVENTIONS.md` there before changing compiler or runtime behaviour.

## Verify

`pnpm lint && pnpm build && pnpm test && pnpm typecheck`
