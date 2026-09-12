/**
 * Route paths here follow the `NectarRoutes` augmentation in `types.test.ts`, which types the
 * whole test program the way a generated `.nectar/types.d.ts` types an app.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MessageFlags } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { buildGraph } from "../src/compiler/index.js";
import { decodeCustomId } from "../src/components/index.js";
import { toManifest, writeManifest } from "../src/manifest/index.js";
import { GENERIC_ERROR_REPLY } from "../src/runtime/index.js";
import { createTestApp, type TestAppOptions } from "../src/testing.js";
import { makeApp } from "./helpers.js";

/** Fixtures import the accessors from the same source module the tests use, so they share a scope. */
const NECTAR = JSON.stringify(
  pathToFileURL(path.resolve(import.meta.dirname, "../src/index.ts")).href,
);
const from = (names: string) => `import { ${names} } from ${NECTAR};\n`;
const handler = (body: string, head = "") =>
  `${head}export default async function (interaction, second) { ${body} }\n`;
const cmd = (meta: string, body: string, head = "") =>
  `export const meta = ${meta};\n${handler(body, head)}`;
const described = 'export const meta = { description: "d" };\n';

const files = {
  "commands/ping/command.ts": cmd('{ description: "d" }', 'await interaction.reply("pong");'),
  "commands/moderation/route.ts": described,
  "commands/moderation/ban/command.ts": cmd(
    '{ description: "d", options: [{ type: "user", name: "target", description: "d", required: true }, { type: "string", name: "reason", description: "d", autocomplete: true }] }',
    "const o = interaction.options; await interaction.reply([o.getSubcommand(), second.target.tag, String(second.reason)].join(' '));",
  ),
  "commands/moderation/ban/autocomplete.ts":
    'export async function reason(interaction) { const o = interaction.options; await interaction.respond([{ name: [o.getFocused(), o.get("target")?.value, String(o.getUser("target"))].join(" "), value: "x" }]); }\n',
  "commands/admin/route.ts": described,
  "commands/admin/roles/route.ts": described,
  "commands/admin/roles/give/command.ts": cmd(
    '{ description: "d", options: [{ type: "role", name: "role", description: "d", required: true }, { type: "integer", name: "days", description: "d" }] }',
    "const o = interaction.options; await interaction.reply([o.getSubcommandGroup(), o.getSubcommand(), second.role.name, second.days].join(' '));",
  ),
  "commands/info/command.ts": cmd(
    '{ type: "user" }',
    "await interaction.reply(interaction.targetUser.tag);",
  ),
  "commands/slow/command.ts": cmd(
    '{ description: "d", defer: "ephemeral" }',
    'if (interaction.guildId === "crash") throw new Error("late"); await interaction.editReply("done");',
  ),
  "components/confirm/button.ts": handler(
    "await interaction.reply(String(interaction.inCachedGuild()));",
  ),
  "components/tickets/[ticketId]/close/button.ts":
    "const h = async (interaction, params) => { await interaction.update({ content: 'closed ' + params.ticketId }); };\nh.params = { ticketId: (v) => v !== 'bad' };\nexport default h;\n",
  "components/tickets/[ticketId]/assign/select.ts": `export const kind = "user";\n${handler(
    "await interaction.reply(interaction.isUserSelectMenu() + ' ' + interaction.values.length);",
  )}`,
  "components/wizard/[id]/[...steps]/modal.ts": handler(
    'await interaction.reply(interaction.fields.getTextInputValue("title") + " " + second.steps.join(","));',
  ),
};

const quiet = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

async function testApp(app: Record<string, string> = files, options: TestAppOptions = {}) {
  const root = makeApp(app);
  const graph = await buildGraph(root);
  expect(graph.diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
  const outDir = path.join(root, ".nectar");
  const manifest = writeManifest(toManifest(graph, outDir), outDir);
  return createTestApp(manifest, { logger: quiet(), ...options });
}

test("a missing manifest asks for a build", () => {
  const missing = path.join(makeApp({}), "manifest.json");
  expect(() => createTestApp(missing)).toThrow(`${missing} not found. Run \`nectar build\``);
});

describe("commands", () => {
  test("responses are recorded and the outcome closes the signals", async () => {
    const { interaction, responses, outcome, signals } = await (await testApp()).command("ping");
    expect(responses).toEqual([{ method: "reply", options: "pong" }]);
    expect(interaction.replied).toBe(true);
    expect(outcome).toMatchObject({
      type: "interaction:complete",
      handled: true,
      route: { id: "command:ping" },
    });
    expect(signals.map((s) => s.type)).toEqual([
      "interaction:start",
      "route:match",
      "handler:enter",
      "handler:complete",
      "interaction:complete",
    ]);
  });

  test("options go through discord.js's resolver under their subcommand and group", async () => {
    const app = await testApp();
    const ban = await app.command("moderation/ban", {
      target: { id: "1", tag: "someone#0001" },
      reason: "spam",
    });
    expect(ban.responses).toEqual([{ method: "reply", options: "ban someone#0001 spam" }]);
    const give = await app.command("admin/roles/give", { role: { name: "Mod" }, days: 3 });
    expect(give.responses).toEqual([{ method: "reply", options: "roles give Mod 3" }]);

    // Every declared option reaches the handler; the ones left out are null.
    const quiet = await app.command("moderation/ban", { target: { id: "1", tag: "x" } });
    expect(quiet.responses).toEqual([{ method: "reply", options: "ban x null" }]);

    // @ts-expect-error not an option of the command
    await expect(app.command("admin/roles/give", { nope: 1 })).rejects.toThrow(
      'Route command:admin/roles/give has no option "nope". It takes: role, days.',
    );
    // @ts-expect-error ping takes no options
    await expect(app.command("ping", { nope: 1 })).rejects.toThrow("It takes none.");
    // @ts-expect-error unknown command
    await expect(app.command("nope")).rejects.toThrow('No command route "nope"');
  });

  test("context menus and discord.js guards read the stub's fields", async () => {
    const app = await testApp();
    const info = await app.command("info", {}, { targetUser: { tag: "someone#0001" } });
    expect(info.responses).toEqual([{ method: "reply", options: "someone#0001" }]);
    expect(info.interaction.isUserContextMenuCommand()).toBe(true);

    expect((await app.button("confirm")).responses[0]?.options).toBe("false");
    const cached = await app.button("confirm", {}, { guild: {}, member: {} });
    expect(cached.responses[0]?.options).toBe("true");
  });

  test("meta.defer defers before the handler, and the default boundary fills the deferred reply", async () => {
    const app = await testApp();
    const slow = await app.command("slow");
    expect(slow.responses).toEqual([
      { method: "deferReply", options: { flags: MessageFlags.Ephemeral } },
      { method: "editReply", options: "done" },
    ]);

    const crash = await app.command("slow", {}, { guildId: "crash" });
    expect(crash.outcome).toMatchObject({ type: "interaction:fail", boundary: null });
    expect(crash.responses).toEqual([
      { method: "deferReply", options: { flags: MessageFlags.Ephemeral } },
      { method: "editReply", options: { content: GENERIC_ERROR_REPLY } },
    ]);

    // A middleware that already answered wins over the automatic defer.
    const stopped = await testApp({
      ...files,
      "commands/slow/middleware.ts":
        'export default async function (interaction) { await interaction.reply("first"); }\n',
    });
    expect((await stopped.command("slow")).responses).toEqual([
      { method: "reply", options: "first" },
      { method: "editReply", options: "done" },
    ]);
  });

  test("failures reach the boundaries, and the default reply only goes out unanswered", async () => {
    const app = await testApp({
      "commands/ping/command.ts": cmd(
        '{ description: "d" }',
        'if (interaction.guildId !== null) await interaction.reply("partial"); throw new Error("crash");',
      ),
      "commands/info/command.ts": cmd('{ type: "user" }', 'throw new Error("caught");'),
      "commands/info/error.ts": "export default async function () {}\n",
    });
    const crash = await app.command("ping");
    expect(crash.outcome).toMatchObject({
      type: "interaction:fail",
      boundary: null,
      error: { message: "crash" },
    });
    expect(crash.responses).toEqual([
      { method: "reply", options: { content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral } },
    ]);

    const answered = await app.command("ping", {}, { guildId: "1" });
    expect(answered.responses).toEqual([{ method: "reply", options: "partial" }]);

    const caught = await app.command("info");
    expect(caught.outcome).toMatchObject({
      type: "interaction:fail",
      boundary: expect.stringMatching(/info[\\/]error\.ts$/),
    });
    expect(caught.responses).toEqual([]);
  });
});

describe("components", () => {
  test("custom IDs are encoded from params, then matched and validated", async () => {
    const app = await testApp();
    const close = await app.button("tickets/[ticketId]/close", { ticketId: "a:b" });
    expect(close.responses).toEqual([{ method: "update", options: { content: "closed a:b" } }]);
    expect(decodeCustomId(close.interaction.customId)).toMatchObject({ values: ["a:b"] });

    const refused = await app.button("tickets/[ticketId]/close", { ticketId: "bad" });
    expect(refused.outcome).toMatchObject({
      type: "interaction:reject",
      reason: "invalid-param",
      param: "ticketId",
    });
    expect(refused.responses).toEqual([]);

    // @ts-expect-error the route needs its ticketId
    await expect(app.button("tickets/[ticketId]/close")).rejects.toThrow('parameter "ticketId"');
    await expect(app.button("tickets/[ticketId]/assign", { ticketId: "1" })).rejects.toThrow(
      'No button route "tickets/[ticketId]/assign"',
    );
  });

  test("selects and modals", async () => {
    const app = await testApp();
    const assign = await app.select("tickets/[ticketId]/assign", { ticketId: "1" });
    expect(assign.responses[0]?.options).toBe("true 0");

    const wizard = await app.modal(
      "wizard/[id]/[...steps]",
      { id: "1", steps: ["a", "b"] },
      { fields: { getTextInputValue: () => "title" } },
    );
    expect(wizard.responses).toEqual([{ method: "reply", options: "title a,b" }]);
    expect(wizard.interaction.isModalSubmit()).toBe(true);
  });
});

describe("autocomplete", () => {
  test("the focused option reaches the handler, the others as Discord sends them", async () => {
    const app = await testApp();
    const { responses, interaction } = await app.autocomplete("moderation/ban", "reason", {
      reason: "sp",
      target: { id: "1", tag: "someone#0001" },
    });
    expect(responses).toEqual([
      { method: "respond", options: [{ name: "sp 1 null", value: "x" }] },
    ]);
    expect(interaction.responded).toBe(true);

    // @ts-expect-error target has no autocomplete handler
    await expect(app.autocomplete("moderation/ban", "target")).rejects.toThrow(
      'Route command:moderation/ban has no autocomplete handler for "target". It handles: reason.',
    );
  });
});

describe("middleware", () => {
  test("handlers read middleware results with use(), and stop ends the chain", async () => {
    const app = await testApp({
      ...files,
      "middleware.ts": `${from("stop")}export default async function (interaction) { if (interaction.guildId === null) return stop; return { member: interaction.member }; }\n`,
      "commands/whoami/command.ts": cmd(
        '{ description: "d" }',
        "await interaction.reply(use(guard).member.displayName);",
        `${from("use")}import guard from "../../middleware.ts";\n`,
      ),
      "components/tickets/[ticketId]/close/button.ts": handler(
        "await interaction.update(use(guard).member.displayName + second.ticketId);",
        `${from("use")}import guard from "../../../../middleware.ts";\n`,
      ),
    });

    const stopped = await app.command("whoami");
    expect(stopped.outcome).toMatchObject({ type: "interaction:complete", handled: false });
    expect(stopped.responses).toEqual([]);

    const inGuild = { guildId: "1", member: { displayName: "Mod" } };
    expect((await app.command("whoami", {}, inGuild)).responses).toEqual([
      { method: "reply", options: "Mod" },
    ]);
    const close = await app.button("tickets/[ticketId]/close", { ticketId: "7" }, inGuild);
    expect(close.responses).toEqual([{ method: "update", options: "Mod7" }]);
    // Autocomplete runs the same chain, so the DM case stops it and answers with nothing.
    const suggest = await app.autocomplete("moderation/ban", "reason", {});
    expect(suggest.outcome).toMatchObject({ handled: false });
  });
});

describe("events", () => {
  test("handlers run in manifest order, once handlers once, failures reach boundaries", async () => {
    const app = await testApp({
      "error.ts": "export default async function () {}\n",
      "events/messageCreate/(a)/event.ts":
        'export const meta = { order: 1 };\nexport default async function (message) { message.seen.push("a"); }\n',
      "events/messageCreate/(b)/event.ts":
        'export const meta = { order: 0 };\nexport default async function (message) { await new Promise((r) => setTimeout(r, 5)); message.seen.push("b"); }\n',
      "events/guildMemberAdd/event.ts": `export const meta = { once: true };\n${from("route")}export default async function (member) { member.seen.push(route().id); }\n`,
      "events/guildMemberRemove/event.ts":
        'export default async function () { throw new Error("left"); }\n',
    });

    // Stubs stand in for discord.js objects; the handlers only touch `seen`.
    const message = { seen: [] as string[] };
    expect(await app.event("messageCreate", message as never)).toEqual({ failures: [] });
    expect(message.seen).toEqual(["b", "a"]);

    const member = { seen: [] as string[] };
    await app.event("guildMemberAdd", member as never);
    await app.event("guildMemberAdd", member as never);
    expect(member.seen).toEqual(["event:guildMemberAdd"]);

    const { failures } = await app.event("guildMemberRemove", {} as never);
    expect(failures).toMatchObject([
      {
        event: "guildMemberRemove",
        error: { message: "left" },
        boundary: expect.stringMatching(/error\.ts$/),
      },
    ]);

    await expect(app.event("channelCreate", {} as never)).rejects.toThrow(
      'No event route "channelCreate"',
    );
  });
});
