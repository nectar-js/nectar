# Contributing to Nect

Thanks for taking a look. Bug reports, route cases the compiler gets wrong, and diagnostics that could name the problem better are all useful.

## Setup

You need Node.js 22.18 or newer and pnpm.

```bash
pnpm install
pnpm build
```

`examples/basic` is the app the compiler tests run against. It exercises subcommands, a route group, dynamic component params, autocomplete, scoped middleware, and an error boundary.

```bash
pnpm --filter basic run build    # writes .nect/manifest.json and .nect/types.d.ts
pnpm --filter basic run routes   # prints the compiled tree
```

Those call the CLI through `node`, because pnpm links the `nect` bin at install time and `packages/core/dist` does not exist yet on a fresh clone.

## Before you open a pull request

```bash
pnpm lint
pnpm build
pnpm test
pnpm typecheck
```

CI runs the same commands on Node 22 and 24.

Add a changeset for anything that changes published behaviour:

```bash
pnpm changeset
```

Pick the affected packages and a bump. Patch for fixes, minor for new capability, major for a break. Write the entry for someone reading a changelog, not for someone reading the diff.

## Pull requests

Keep a pull request to one change. A bug fix that also renames things is two pull requests.

Tests belong with the change. A compiler fix should come with a fixture that failed before it. A dispatch fix should come with a test using the mocked interactions in `packages/core/src/runtime`.

Diagnostics are part of the product. When you add a compiler error, say what was found, why it is invalid, which file caused it, and what the convention is.

## Reporting a bug

Include the app tree, the file that misbehaves, what you expected Discord to receive, and what it received. `pnpm exec nect routes` and `pnpm exec nect manifest --route <id>` output usually pin it down faster than a description.

## License

Contributions are licensed under the MIT license in [LICENSE](./LICENSE).
