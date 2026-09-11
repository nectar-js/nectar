import { describe, expect, test } from "vitest";
import { compileAutocomplete } from "../src/autocomplete/index.js";
import { compileCommands } from "../src/commands/index.js";
import { buildRouteTable } from "../src/compiler/index.js";
import { makeApp } from "./helpers.js";

const cmd = (options: string) =>
  `export const meta = { description: "d", options: [${options}] };\nexport default async function () {}\n`;
const str = (name: string, autocomplete = true) =>
  `{ type: "string", name: "${name}", description: "d", autocomplete: ${autocomplete} }`;
const ac = (...names: string[]) =>
  names.map((n) => `export async function ${n}() { return []; }`).join("\n");

async function compile(files: Record<string, string>) {
  const root = makeApp(files);
  const table = buildRouteTable(root);
  expect(table.diagnostics.items).toEqual([]);
  const commands = await compileCommands(table);
  expect(commands.diagnostics.items).toEqual([]);
  const result = await compileAutocomplete(table, commands.commands);
  return {
    links: result.autocomplete.map((a) => [a.route.id, a.command.id, a.options]),
    codes: result.diagnostics.items.map((d) => d.code),
    diagnostics: result.diagnostics.items,
  };
}

describe("autocomplete", () => {
  test("links exports to options of a plain command", async () => {
    const { links, codes } = await compile({
      "commands/search/command.ts": cmd(`${str("query")}, ${str("tag")}, ${str("plain", false)}`),
      "commands/search/autocomplete.ts": ac("tag", "query"),
    });
    expect(codes).toEqual([]);
    expect(links).toEqual([["command:search", "command:search", ["query", "tag"]]]);
  });

  test("finds options inside subcommands and groups", async () => {
    const { links, codes } = await compile({
      "commands/cfg/route.ts": 'export const meta = { description: "d" };\n',
      "commands/cfg/set/command.ts": cmd(str("key")),
      "commands/cfg/set/autocomplete.ts": ac("key"),
      "commands/cfg/roles/route.ts": 'export const meta = { description: "d" };\n',
      "commands/cfg/roles/add/command.ts": cmd(str("role")),
      "commands/cfg/roles/add/autocomplete.ts": ac("role"),
    });
    expect(codes).toEqual([]);
    expect(links).toEqual([
      ["command:cfg/roles/add", "command:cfg/roles/add", ["role"]],
      ["command:cfg/set", "command:cfg/set", ["key"]],
    ]);
  });

  test("export for an option without autocomplete", async () => {
    const { codes, diagnostics } = await compile({
      "commands/search/command.ts": cmd(`${str("query")}, ${str("plain", false)}`),
      "commands/search/autocomplete.ts": ac("query", "plain"),
    });
    expect(codes).toEqual(["autocomplete-unknown-option"]);
    expect(diagnostics[0]?.message).toContain("Expected one of: query.");
  });

  test("autocomplete option without a handler export", async () => {
    const { codes, diagnostics } = await compile({
      "commands/search/command.ts": cmd(`${str("query")}, ${str("tag")}`),
      "commands/search/autocomplete.ts": ac("query"),
    });
    expect(codes).toEqual(["autocomplete-missing-handler"]);
    expect(diagnostics[0]?.message).toContain('"tag"');
  });

  test("autocomplete option without an autocomplete.ts", async () => {
    const { codes, diagnostics } = await compile({
      "commands/search/command.ts": cmd(str("query")),
    });
    expect(codes).toEqual(["autocomplete-missing-file"]);
    expect(diagnostics[0]?.route).toBe("command:search");
  });

  test("non-function export", async () => {
    const { codes } = await compile({
      "commands/search/command.ts": cmd(str("query")),
      "commands/search/autocomplete.ts": "export const query = [];\n",
    });
    expect(codes).toEqual(["autocomplete-export-not-function"]);
  });

  test("autocomplete.ts without a command.ts", async () => {
    const { codes } = await compile({
      "commands/search/autocomplete.ts": ac("query"),
    });
    expect(codes).toEqual(["autocomplete-without-command"]);
  });

  test("a command.ts with errors doesn't also report its autocomplete.ts", async () => {
    const table = buildRouteTable(
      makeApp({
        "commands/search/command.ts": "export default async function () {}\n",
        "commands/search/autocomplete.ts": ac("query"),
      }),
    );
    const commands = await compileCommands(table);
    expect(commands.diagnostics.items.map((d) => d.code)).toEqual(["missing-meta"]);
    const result = await compileAutocomplete(table, commands.commands);
    expect(result.diagnostics.items).toEqual([]);
  });
});
