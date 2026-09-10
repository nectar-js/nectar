import { describe, expect, test } from "vitest";
import { registrationScopes } from "../src/registration/index.js";

describe("registrationScopes", () => {
  test("development and test use dev guilds only", () => {
    const config = { dev: { guilds: ["1", "2"] }, commands: { target: "global" as const } };
    expect(registrationScopes(config, "development")).toEqual([{ guild: "1" }, { guild: "2" }]);
    expect(registrationScopes(config, "test")).toEqual([{ guild: "1" }, { guild: "2" }]);
    expect(registrationScopes({}, "development")).toEqual([]);
  });

  test("production follows commands.target, global by default", () => {
    expect(registrationScopes({ dev: { guilds: ["1"] } }, "production")).toEqual(["global"]);
    expect(registrationScopes({ commands: { target: ["9"] } }, "production")).toEqual([
      { guild: "9" },
    ]);
  });
});
