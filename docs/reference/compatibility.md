# Compatibility

Nectar follows semantic versioning. Before 1.0, breaking changes can happen in minor versions.

## Public API

Breaking changes to any of these follow semantic versioning:

- Reserved file names and what each file exports
- Directory name syntax: static segments, `[param]`, `[...rest]`, and `(group)`
- How paths become command names, route IDs, and custom IDs
- The custom ID format. Changing it breaks components on messages that were already sent.
- Middleware order and error boundary order
- Config options and their defaults
- CLI commands, flags, and exit codes
- The exports of `@nectar-js/nectar`, `@nectar-js/nectar/testing`, and `@nectar-js/nectar/start`
- The route types generated in `.nectar/types.d.ts`
- The graph that plugins receive in `transform` and `types`
- Signal names and fields
- `node .nectar/start.mjs` as the way to run a build

## Not public

These can change in any release:

- Everything in `.nectar/` except `start.mjs`. Run `nectar build` after upgrading.
- The text of log messages and diagnostics
- Modules imported from inside the package instead of through its exports
