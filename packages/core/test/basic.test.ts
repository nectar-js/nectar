import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
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
