import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileCommands } from "../src/commands/index.js";
import { buildRouteTable } from "../src/compiler/index.js";
import {
  compileComponents,
  createMatcher,
  customIdFor,
  MAX_CUSTOM_ID_LENGTH,
} from "../src/components/index.js";
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

test("examples/basic component routes round-trip", async () => {
  const { routes, diagnostics } = await compileComponents(buildRouteTable(appDir));
  expect(diagnostics.items).toEqual([]);
  const matcher = createMatcher(routes);

  for (const route of routes) {
    const params = Object.fromEntries(route.params.map((name, i) => [name, `v${i}:x`]));
    const customId = customIdFor(route, params);
    expect(customId.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
    expect(matcher.match(route.kind, customId)).toEqual({ ok: true, route, params });
  }

  expect(
    routes.map((r) => ({
      id: r.id,
      shortId: r.shortId,
      kind: r.kind,
      selectKind: r.selectKind,
      params: r.params,
      overhead: r.overhead,
    })),
  ).toMatchSnapshot();
});
