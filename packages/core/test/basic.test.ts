import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileCommands } from "../src/commands/index.js";
import { buildRouteTable } from "../src/compiler/index.js";
import { normalize } from "./helpers.js";

const appDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../examples/basic/app",
);

test("examples/basic route table", () => {
  const table = normalize(buildRouteTable(appDir), appDir);
  expect(table.diagnostics).toEqual([]);
  expect(table).toMatchSnapshot();
});

test("examples/basic command payloads", async () => {
  const { commands, diagnostics } = await compileCommands(buildRouteTable(appDir));
  expect(diagnostics.items).toEqual([]);
  expect(
    commands.map((c) => ({
      name: c.name,
      handlers: Object.fromEntries(Object.entries(c.handlers).map(([k, r]) => [k, r.id])),
      payload: c.payload,
    })),
  ).toMatchSnapshot();
});
