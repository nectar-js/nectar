# Plugins

A plugin hooks into the build and the bot's lifecycle. Code that handlers only import, like a database client or a middleware factory, doesn't need to be a plugin.

Plugins are registered in the config:

```ts
// nectar.config.ts
import { defineConfig } from "@nectar-js/nectar";
import { usage } from "./plugins/usage/index.ts";

export default defineConfig({
  intents: ["Guilds"],
  plugins: [usage()],
});
```

Hooks run in the order of `plugins`, except `stop` and `stopGlobal`, which run in reverse. Plugin names have to be unique. Every hook is optional:

```ts
import { definePlugin } from "@nectar-js/nectar";

export default definePlugin({
  name: "usage",
  transform(graph) {},
  types(graph) {},
  commands: [],
  start(app) {},
  stop(app) {},
  startGlobal(app) {},
  stopGlobal(app) {},
});
```

## `transform`

Runs after the app compiles without errors and before `.nectar/` is written, in every command that compiles. `graph` has `appDir`, `routes`, `commands`, and `events` in the manifest's format, with absolute file paths. It's frozen, so return changes instead of editing it:

```ts
transform: (graph) =>
  graph.routes
    .filter((route) => route.kind === "command")
    .map((route) => ({
      type: "middleware",
      route: route.id,
      kind: "command",
      file: path.join(import.meta.dirname, "middleware.ts"),
    })),
```

A `middleware` change adds the default export of `file`, an absolute path, to a route's middleware. With `position: "outer"`, the default, it runs before the app's middleware. With `"inner"`, it runs right before the handler. A command and its autocomplete share a route ID, so set `kind` to target one of them. Event routes can't take middleware.

A `diagnostic` change reports a problem:

```ts
{ type: "diagnostic", severity: "warning", code: "usage-empty", message: "No commands to count." }
```

Each plugin sees the changes from the plugins before it. An unknown route, a missing file, an invalid change, or a thrown error fails the build with an error that names the plugin. Plugins can't add, remove, or rename routes.

Each route in the manifest lists the plugins that changed it under `plugins`, which `nectar manifest --route` shows.

## `types`

Returns a string that `nectar build` appends to `.nectar/types.d.ts`. Middleware added by `transform` gets typed without it.

## `commands`

Adds commands to the CLI:

```ts
commands: [
  {
    name: "usage",
    description: "Count command runs.",
    options: { top: { type: "string", description: "Show only the N most used." } },
    run({ project, flags, out }) {
      out(`Top ${flags.top ?? "all"} in ${project.root}`);
      return 0;
    },
  },
],
```

Names are lowercase and can't match a built-in command. Options are `"string"` or `"boolean"` flags. `run` returns the exit code. `project` has `root`, `configFile`, `config`, `appDir`, `outDir`, and `env`. Plugin commands show up in `nectar --help`.

## `start`

Runs in every process that starts the bot, before handlers are imported and before login. `app` has `client`, `env`, `logger`, `signals`, and `manifest`. The client isn't connected yet.

The object `start` returns becomes `ctx.services` in handlers and middleware. Declare its type with module augmentation:

```ts
declare module "@nectar-js/nectar" {
  interface NectarServices {
    usage: UsageLog;
  }
}
```

The bot doesn't start if a `start` hook throws or two plugins return the same service name.

## `stop`

Runs on shutdown, after running interactions finish and before the client disconnects. Errors are logged, and shutdown continues.

## `startGlobal` and `stopGlobal`

Like `start` and `stop`, but only in the process that runs shard 0, so they run once however the bot is sharded. `startGlobal` runs after every `start`, and `stopGlobal` before every `stop`. Use them for work that shouldn't repeat per shard, like scheduled jobs. See [Sharding](../guides/sharding).

## In development

`nectar dev` runs `transform` again on every rebuild and reloads plugin middleware when it changes. Other plugin changes apply when you save `nectar.config.ts` or restart `nectar dev`.

[`examples/plugin`](https://github.com/nectar-js/nectar/tree/main/examples/plugin) in the repository has a complete plugin.
