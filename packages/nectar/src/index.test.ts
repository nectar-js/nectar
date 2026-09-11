import { expect, test } from "vitest";
import { version } from "./index.js";

test("exports a version", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});
