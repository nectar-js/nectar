# Plugins

A plugin hooks into Nectar's build and runtime. Most shared code should not be one.

## Plugin or library

A package that exports a database client, a queue, an analytics SDK, or a middleware factory is ordinary code. Import it from a handler or a `middleware.ts`. Nectar's own `guildOnly` and `requirePermissions` work that way, and they are not plugins.

Write a plugin when the code has to do one of these:

- change routes at build time, like wrapping every command in a middleware the app never mentions
- run when the bot starts or stops
- put a service on `ctx.services`
- add a `nectar` command
- add declarations to `.nectar/types.d.ts`

If none apply, publish a library.

## Registering

Plugins go in the config, and nowhere else:

```ts
import { defineConfig } from "@nectar-js/nectar";
import { usage } from "./plugins/usage/index.ts";

export default defineConfig({
  intents: ["Guilds"],
  plugins: [usage()],
});
```

Hooks run in array order. Names must be unique.

## Hooks

```ts
import { definePlugin } from "@nectar-js/nectar";

export default definePlugin({
  name: "usage",
  version: "1.0.0",
  transform(graph) {}, // after routes compile, before the manifest is written
  types(graph) {},     // appended to .nectar/types.d.ts
  commands: [],        // extra nectar commands
  start(app) {},       // before login, returns services
  stop(app) {},        // after in-flight interactions finish
});
```

Every hook is optional.

### transform

`transform` gets the compiled app in manifest shape, with absolute file paths. The object is frozen, so writing to it throws. To change something, return a list of changes. The compiler checks each one and applies it.

A plugin can add middleware to a route:

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

`file` is an absolute path to a module whose default export is a middleware. `position: "outer"`, the default, runs it before the app's own middleware. `position: "inner"` runs it right before the handler.

A command and its autocomplete share a route ID. Without `kind`, both get the middleware, as they would from a `middleware.ts` in their directory.

A plugin can also report a problem:

```ts
{ type: "diagnostic", severity: "warning", code: "usage-no-commands", message: "No commands to log." }
```

An unknown route, a missing file, an unknown change type, or a `transform` that throws becomes a compile error that names the plugin. The build stops as it would for any other error.

Each plugin sees the changes from the plugins before it. Transforms cannot add, remove, or rename routes.

The manifest records which plugins changed each route. `nectar manifest --route command:ping` prints it:

```json
"middleware": ["../plugins/usage/middleware.ts"],
"plugins": ["usage"]
```

### start and stop

`start` runs once, before Nectar imports handlers and before the client logs in. It gets `{ client, env, logger, signals, manifest }`. The client is not connected yet. Subscribe to `signals` for gateway state.

Whatever `start` returns lands on `ctx.services` for every command, component, and event handler, and for every middleware. Declare the type with module augmentation:

```ts
declare module "@nectar-js/nectar" {
  interface NectarServices {
    usage: UsageLog;
  }
}
```

Two plugins returning the same service name fail startup. So does a `start` that throws. The bot never logs in.

`stop` runs in reverse order on shutdown, after in-flight interactions finish and before the client is destroyed. Nectar logs a `stop` that throws and carries on with shutdown.

### commands

```ts
commands: [
  {
    name: "usage",
    description: "Count command runs in the usage log.",
    options: { top: { type: "string", description: "Show only the N most used." } },
    run({ project, flags, out, err }) {
      // flags.top is a string or undefined. project.root is the directory holding the config.
      return 0;
    },
  },
],
```

Plugin commands show up under "Plugin commands" in `nectar --help` and take `--help` like the built-in ones. Names are lowercase and cannot reuse a built-in name. `run` returns the exit code. `project` holds `root`, `config`, `appDir`, `outDir`, and `env`.

### types

`types(graph)` returns a string that `nectar build` appends to `.nectar/types.d.ts`.

Middleware a plugin adds doesn't need this hook. Nectar types it like app middleware, so `next({ member })` puts `member` on the handler's context type.

## Under nectar dev

Every rebuild runs the transforms again. Plugin middleware reloads when you save it, like any other file. Changes to the plugin's hooks apply when the config reloads, so save `nectar.config.ts` or restart `nectar dev`.

## Example

`examples/plugin` has a plugin that logs every command run to a file and adds `nectar usage` to count them. It uses `transform`, `start`, `stop`, a service, and a command.
