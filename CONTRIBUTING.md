# Contributing to Nectar

## Setup

You need Node.js 22.18 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm --filter basic run build
```

The last command compiles `examples/basic`, which the tests assert against. Rerun it after changing the example's routes. `pnpm --filter basic run routes` prints its route tree.

## Before you open a pull request

```bash
pnpm lint
pnpm build
pnpm --filter basic run build
pnpm test
pnpm typecheck
```

CI runs the same commands on Node 22 and 24.

If you changed published behaviour, run `pnpm changeset` and describe what changes for users.

## Pull requests

Keep pull requests to one change. Send renames and cleanup separately from fixes.

Bug fixes need a test that fails without the fix. Tests live in `packages/nectar/test`, and `makeApp` in `helpers.ts` writes a throwaway app tree for them.

New compiler diagnostics should pass the offending `file` and say what's wrong, why, and what's expected, like the ones in `packages/nectar/src/compiler/routes.ts`. Add the code to `DIAGNOSTIC_CODES` in `packages/nectar/src/compiler/diagnostics.ts` and give it an entry in `docs/reference/diagnostics.md`, which the CLI links to.

## Reporting a bug

Include the file that misbehaves, what you expected Discord to receive, and what it received. Paste the output of `nectar routes` and `nectar manifest --route <id>` too.

## License

Contributions are licensed under the MIT license in [LICENSE](./LICENSE).
