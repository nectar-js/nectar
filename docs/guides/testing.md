# Testing

`@nectar-js/nectar/testing` runs routes from a built manifest through the same dispatch code as the bot, using stubbed discord.js interactions. Nothing connects to Discord.

```ts
// test/app.test.ts
import { createTestApp } from "@nectar-js/nectar/testing";
import { expect, test } from "vitest";

const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

test("ping replies", async () => {
  const { responses } = await app.command("ping");
  expect(responses).toEqual([{ method: "reply", options: "Pong." }]);
});
```

The examples use Vitest, but any test runner works. Build before testing so the manifest is current:

```json
"scripts": {
  "test": "nectar build && vitest run"
}
```

## Running routes

| Method | Runs |
| --- | --- |
| `app.command(path, options?, interaction?)` | A slash command or context menu command |
| `app.autocomplete(path, option, options?, interaction?)` | The autocomplete function for `option` |
| `app.button(path, params?, interaction?)` | A button |
| `app.select(path, params?, interaction?)` | A select menu |
| `app.modal(path, params?, interaction?)` | A modal submission |
| `app.event(name, ...args)` | Every handler of a discord.js event |

`path` is the route path, as passed to `defineCommand` or `defineComponent`. With generated types, TypeScript checks paths, options, and parameters.

Command options are values by option name. User, channel, role, mentionable, and attachment options take an object with the fields the handler reads:

```ts
await app.command("moderation/ban", { target: { id: "2", tag: "spammer" }, reason: "spam" });
```

Component parameters go through the real custom ID encoding, decoding, and validators.

## Stubbing the interaction

The last argument sets fields on the interaction. Pass whatever the handler reads:

```ts
const ban = vi.fn(async () => {});
const { responses } = await app.command(
  "moderation/ban",
  { target: { id: "2", tag: "spammer" }, reason: "spam" },
  { guild: { members: { ban } }, member: { displayName: "Mod" } },
);
expect(ban).toHaveBeenCalledWith({ id: "2", tag: "spammer" }, { reason: "spam" });
```

TypeScript checks field names against the discord.js type, but not their values. Type guards like `isButton()` and `inCachedGuild()` are discord.js's own and read the stub's fields. The stub has no guild or member unless you pass them. Select menus start with empty `values`, and a modal needs `fields` if the handler reads inputs.

## Results

Commands and components resolve to:

| Field | |
| --- | --- |
| `responses` | Each response method the route called, as `{ method, options }` |
| `outcome` | The final signal: `interaction:complete`, `interaction:fail`, or `interaction:reject` |
| `signals` | Every signal from the interaction |

When middleware stops the chain, `outcome.handled` is `false`. When the route throws, `outcome.type` is `interaction:fail`, and `outcome.boundary` names the `error.ts` that handled it.

`app.event` resolves to `{ failures }`, with one `event:fail` signal for each handler that threw.

## Options

`createTestApp(manifest, options)` takes:

| Option | |
| --- | --- |
| `client` | What `client()` returns in handlers. Defaults to a discord.js `Client` that never logs in. |
| `env` | Defaults to `"test"`. |
| `logger` | Receives warnings and default boundary output. Defaults to the console. |
| `services` | What `services()` returns in handlers. Plugin `start` hooks don't run in tests. |

`customId` works in tests once the test app exists.
