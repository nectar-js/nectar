import { describe, expect, test } from "vitest";
import { compileCommands } from "../src/commands/index.js";
import { buildRouteTable } from "../src/compiler/index.js";
import { makeApp } from "./helpers.js";

const cmd = (meta: string, body = "export default async function () {}") =>
  `export const meta = ${meta};\n${body}\n`;
const routeMeta = (meta: string) => `export const meta = ${meta};\n`;

async function compile(files: Record<string, string>) {
  const root = makeApp(files);
  const table = buildRouteTable(root);
  expect(table.diagnostics.items).toEqual([]);
  const result = await compileCommands(table);
  return {
    commands: result.commands,
    payloads: result.commands.map((c) => c.payload),
    handlers: result.commands.map((c) => Object.keys(c.handlers)),
    codes: result.diagnostics.items.map((d) => d.code),
    diagnostics: result.diagnostics.items,
  };
}

describe("hierarchy", () => {
  test("plain chat input command", async () => {
    const { payloads, handlers, codes } = await compile({
      "commands/ping/command.ts": cmd('{ description: "Pong" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads).toEqual([{ name: "ping", type: 1, description: "Pong" }]);
    expect(handlers).toEqual([[""]]);
  });

  test("subcommands under a route.ts parent", async () => {
    const { payloads, handlers, codes } = await compile({
      "commands/mod/route.ts": routeMeta('{ description: "Moderation" }'),
      "commands/mod/ban/command.ts": cmd('{ description: "Ban" }'),
      "commands/mod/kick/command.ts": cmd('{ description: "Kick" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads).toEqual([
      {
        name: "mod",
        type: 1,
        description: "Moderation",
        options: [
          { type: 1, name: "ban", description: "Ban" },
          { type: 1, name: "kick", description: "Kick" },
        ],
      },
    ]);
    expect(handlers).toEqual([["ban", "kick"]]);
  });

  test("subcommand groups", async () => {
    const { payloads, handlers, codes } = await compile({
      "commands/settings/route.ts": routeMeta('{ description: "Settings" }'),
      "commands/settings/show/command.ts": cmd('{ description: "Show" }'),
      "commands/settings/roles/route.ts": routeMeta('{ description: "Role settings" }'),
      "commands/settings/roles/add/command.ts": cmd('{ description: "Add" }'),
      "commands/settings/roles/remove/command.ts": cmd('{ description: "Remove" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads[0]?.options).toEqual([
      {
        type: 2,
        name: "roles",
        description: "Role settings",
        options: [
          { type: 1, name: "add", description: "Add" },
          { type: 1, name: "remove", description: "Remove" },
        ],
      },
      { type: 1, name: "show", description: "Show" },
    ]);
    expect(handlers).toEqual([["roles/add", "roles/remove", "show"]]);
  });

  test("route groups are transparent", async () => {
    const { payloads, codes } = await compile({
      "commands/(admin)/mod/route.ts": routeMeta('{ description: "Moderation" }'),
      "commands/(admin)/mod/(danger)/ban/command.ts": cmd('{ description: "Ban" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads[0]?.name).toBe("mod");
    expect(payloads[0]?.options).toHaveLength(1);
  });

  test("context menu commands", async () => {
    const { payloads, codes } = await compile({
      "commands/report/command.ts": cmd('{ type: "message", name: "Report Message" }'),
      "commands/avatar/command.ts": cmd('{ type: "user", name: "Show Avatar" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads).toEqual([
      { name: "Show Avatar", type: 2 },
      { name: "Report Message", type: 3 },
    ]);
  });

  test("name override on a command and a group", async () => {
    const { payloads, handlers, codes } = await compile({
      "commands/cfg/route.ts": routeMeta('{ description: "Config", name: "config" }'),
      "commands/cfg/r/route.ts": routeMeta('{ description: "Roles", name: "roles" }'),
      "commands/cfg/r/add/command.ts": cmd('{ description: "Add", name: "create" }'),
    });
    expect(codes).toEqual([]);
    expect(payloads[0]?.name).toBe("config");
    expect(handlers).toEqual([["roles/create"]]);
  });

  test("commands are sorted by type then name", async () => {
    const { payloads } = await compile({
      "commands/zeta/command.ts": cmd('{ description: "Z" }'),
      "commands/alpha/command.ts": cmd('{ description: "A" }'),
      "commands/ctx/command.ts": cmd('{ type: "user", name: "Ctx" }'),
    });
    expect(payloads.map((p) => p.name)).toEqual(["alpha", "zeta", "Ctx"]);
  });
});

describe("payloads", () => {
  test("options and top-level settings", async () => {
    const { payloads, codes } = await compile({
      "commands/ban/command.ts": cmd(`{
        description: "Ban",
        defaultMemberPermissions: 1n << 2n,
        nsfw: true,
        contexts: [0],
        integrationTypes: [0, 1],
        nameLocalizations: { fr: "bannir" },
        descriptionLocalizations: { fr: "Bannir" },
        options: [
          { type: "user", name: "target", description: "Who", required: true },
          { type: "string", name: "reason", description: "Why", minLength: 1, maxLength: 100, nameLocalizations: { fr: "raison" } },
          { type: "integer", name: "days", description: "Days", minValue: 0, maxValue: 7, choices: [{ name: "none", value: 0 }, { name: "week", value: 7, nameLocalizations: { fr: "semaine" } }] },
          { type: "number", name: "ratio", description: "Ratio", autocomplete: true },
          { type: "channel", name: "log", description: "Log channel", channelTypes: [0, 5] },
          { type: "boolean", name: "silent", description: "Silent" },
          { type: "role", name: "role", description: "Role" },
          { type: "mentionable", name: "who", description: "Who" },
          { type: "attachment", name: "proof", description: "Proof" },
        ],
      }`),
    });
    expect(codes).toEqual([]);
    expect(payloads[0]).toEqual({
      name: "ban",
      type: 1,
      description: "Ban",
      default_member_permissions: "4",
      nsfw: true,
      contexts: [0],
      integration_types: [0, 1],
      name_localizations: { fr: "bannir" },
      description_localizations: { fr: "Bannir" },
      options: [
        { type: 6, name: "target", description: "Who", required: true },
        {
          type: 3,
          name: "reason",
          description: "Why",
          min_length: 1,
          max_length: 100,
          name_localizations: { fr: "raison" },
        },
        {
          type: 4,
          name: "days",
          description: "Days",
          min_value: 0,
          max_value: 7,
          choices: [
            { name: "none", value: 0 },
            { name: "week", value: 7, name_localizations: { fr: "semaine" } },
          ],
        },
        { type: 10, name: "ratio", description: "Ratio", autocomplete: true },
        { type: 7, name: "log", description: "Log channel", channel_types: [0, 5] },
        { type: 5, name: "silent", description: "Silent" },
        { type: 8, name: "role", description: "Role" },
        { type: 9, name: "who", description: "Who" },
        { type: 11, name: "proof", description: "Proof" },
      ],
    });
  });

  test("null permissions and string permissions pass through", async () => {
    const { payloads } = await compile({
      "commands/a/command.ts": cmd('{ description: "A", defaultMemberPermissions: null }'),
      "commands/b/command.ts": cmd('{ description: "B", defaultMemberPermissions: "8" }'),
    });
    expect(payloads.map((p) => p.default_member_permissions)).toEqual([null, "8"]);
  });
});

describe("diagnostics", () => {
  test("missing meta", async () => {
    const { codes } = await compile({
      "commands/ping/command.ts": "export default async function () {}",
    });
    expect(codes).toEqual(["missing-meta"]);
  });

  test("missing description", async () => {
    const { codes } = await compile({ "commands/ping/command.ts": cmd("{}") });
    expect(codes).toEqual(["invalid-description"]);
  });

  test("module that throws on import", async () => {
    const { diagnostics } = await compile({
      "commands/ping/command.ts": 'throw new Error("boom");',
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "module-load-failed",
        message: expect.stringContaining("boom"),
      }),
    ]);
  });

  test("uppercase directory name", async () => {
    const { codes } = await compile({ "commands/Ping/command.ts": cmd('{ description: "Pong" }') });
    expect(codes).toEqual(["invalid-name"]);
  });

  test("command with both handler and subcommands", async () => {
    const { codes } = await compile({
      "commands/mod/command.ts": cmd('{ description: "Mod" }'),
      "commands/mod/ban/command.ts": cmd('{ description: "Ban" }'),
    });
    expect(codes).toEqual(["mixed-command-and-subcommands"]);
  });

  test("subcommand and group with the same name", async () => {
    const { codes } = await compile({
      "commands/mod/route.ts": routeMeta('{ description: "Mod" }'),
      "commands/mod/ban/command.ts": cmd('{ description: "Ban" }'),
      "commands/mod/ban/user/command.ts": cmd('{ description: "Ban user" }'),
    });
    expect(codes).toEqual(["mixed-subcommand-and-group"]);
  });

  test("nesting deeper than three levels", async () => {
    const { codes } = await compile({
      "commands/a/b/c/d/command.ts": cmd('{ description: "Deep" }'),
    });
    expect(codes).toEqual(["command-too-deep"]);
  });

  test("missing route.ts names the directory to create", async () => {
    const { diagnostics } = await compile({
      "commands/(admin)/mod/ban/command.ts": cmd('{ description: "Ban" }'),
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "missing-route-meta",
        message: expect.stringMatching(/\(admin\)[\\/]mod[\\/]route\.ts/),
      }),
    ]);
  });

  test("route.ts at the commands root and unused route.ts", async () => {
    const { codes } = await compile({
      "commands/route.ts": routeMeta('{ description: "Nope" }'),
      "commands/ping/route.ts": routeMeta('{ description: "Unused" }'),
      "commands/ping/command.ts": cmd('{ description: "Pong" }'),
    });
    expect(codes.sort()).toEqual(["route-meta-without-path", "unused-route-meta"]);
  });

  test("context menu nested as a subcommand", async () => {
    const { codes } = await compile({
      "commands/mod/route.ts": routeMeta('{ description: "Mod" }'),
      "commands/mod/report/command.ts": cmd('{ type: "message", name: "Report" }'),
    });
    expect(codes).toEqual(["context-menu-nested"]);
  });

  test("top-level fields on a subcommand or group", async () => {
    const { codes } = await compile({
      "commands/mod/route.ts": routeMeta('{ description: "Mod" }'),
      "commands/mod/ban/command.ts": cmd('{ description: "Ban", nsfw: true }'),
      "commands/mod/roles/route.ts": routeMeta('{ description: "Roles", contexts: [0] }'),
      "commands/mod/roles/add/command.ts": cmd('{ description: "Add" }'),
    });
    expect(codes.sort()).toEqual(["top-level-field-on-group", "top-level-field-on-subcommand"]);
  });

  test("context menu with description or options", async () => {
    const { codes } = await compile({
      "commands/a/command.ts": cmd('{ type: "user", name: "A", description: "x" }'),
      "commands/b/command.ts": cmd('{ type: "user", name: "B", options: [] }'),
    });
    expect(codes).toEqual(["invalid-meta", "invalid-meta"]);
  });

  test("duplicate names through overrides", async () => {
    const { codes } = await compile({
      "commands/a/command.ts": cmd('{ description: "A", name: "same" }'),
      "commands/b/command.ts": cmd('{ description: "B", name: "same" }'),
    });
    expect(codes).toEqual(["duplicate-command-name"]);
  });

  test("one command in two route groups is left to the route table's duplicate-route", async () => {
    const table = buildRouteTable(
      makeApp({
        "commands/ping/command.ts": cmd('{ description: "A" }'),
        "commands/(other)/ping/command.ts": cmd('{ description: "B" }'),
      }),
    );
    expect(table.diagnostics.items.map((d) => d.code)).toEqual(["duplicate-route"]);
    const result = await compileCommands(table);
    expect(result.commands).toEqual([]);
    expect(result.diagnostics.items).toEqual([]);
  });

  test("more than 25 subcommands", async () => {
    const files: Record<string, string> = {
      "commands/big/route.ts": routeMeta('{ description: "Big" }'),
    };
    for (let i = 0; i < 26; i++)
      files[`commands/big/s${i}/command.ts`] = cmd(`{ description: "${i}" }`);
    const { codes } = await compile(files);
    expect(codes).toEqual(["too-many-subcommands"]);
  });

  test.each([
    ['{ description: "x", options: "nope" }', "invalid-option"],
    [
      '{ description: "x", options: [{ type: "text", name: "a", description: "d" }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "A", description: "d" }] }',
      "invalid-name",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "" }] }',
      "invalid-description",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d" }, { type: "string", name: "a", description: "d" }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d" }, { type: "string", name: "b", description: "d", required: true }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "boolean", name: "a", description: "d", choices: [] }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d", minValue: 1 }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "integer", name: "a", description: "d", minLength: 1 }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "user", name: "a", description: "d", channelTypes: [0] }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d", autocomplete: true, choices: [{ name: "n", value: "v" }] }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d", choices: [{ name: "n", value: 1 }] }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "integer", name: "a", description: "d", choices: [{ name: "n", value: "v" }] }] }',
      "invalid-option",
    ],
    [
      '{ description: "x", options: [{ type: "string", name: "a", description: "d", maxLength: 0 }] }',
      "invalid-option",
    ],
    ['{ description: "x", contexts: [5] }', "invalid-meta"],
    ['{ description: "x", integrationTypes: "all" }', "invalid-meta"],
    ['{ description: "x", nsfw: "yes" }', "invalid-meta"],
    ['{ description: "x", defaultMemberPermissions: {} }', "invalid-meta"],
    ['{ description: "x", nameLocalizations: { fr: 1 } }', "invalid-meta"],
    ['{ description: "x", type: "slash" }', "invalid-meta"],
    [`{ description: "${"x".repeat(101)}" }`, "invalid-description"],
    [`{ description: "x", name: "${"a".repeat(33)}" }`, "invalid-name"],
  ])("rejects %s", async (meta, code) => {
    const { codes } = await compile({ "commands/c/command.ts": cmd(meta) });
    expect(codes).toContain(code);
  });
});
