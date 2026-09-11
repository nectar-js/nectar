import { describe, expect, test, vi } from "vitest";
import {
  type CommandRest,
  fetchCommands,
  putCommands,
  RegistrationError,
} from "../src/registration/index.js";

function fakeRest(overrides: Partial<CommandRest> = {}): CommandRest {
  return { get: vi.fn(async () => []), put: vi.fn(async () => []), ...overrides };
}

const rejecting = (error: unknown) =>
  fakeRest({
    put: vi.fn(async () => {
      throw error;
    }),
  });

describe("registration remote", () => {
  test("reads global and guild scopes from the right routes, with localizations", async () => {
    const rest = fakeRest();
    await fetchCommands(rest, "app", "global");
    await fetchCommands(rest, "app", { guild: "g1" });
    const query = { query: new URLSearchParams({ with_localizations: "true" }) };
    expect(rest.get).toHaveBeenNthCalledWith(1, "/applications/app/commands", query);
    expect(rest.get).toHaveBeenNthCalledWith(2, "/applications/app/guilds/g1/commands", query);
  });

  test("bulk overwrites a scope", async () => {
    const rest = fakeRest();
    const body = [{ name: "ping", description: "Pong" }];
    await putCommands(rest, "app", { guild: "g1" }, body);
    expect(rest.put).toHaveBeenCalledWith("/applications/app/guilds/g1/commands", { body });
  });

  test("names the command and field Discord rejected", async () => {
    const discordError = Object.assign(new Error("Invalid Form Body"), {
      rawError: {
        code: 50035,
        message: "Invalid Form Body",
        errors: {
          "1": {
            options: {
              "0": {
                description: {
                  _errors: [
                    {
                      code: "BASE_TYPE_BAD_LENGTH",
                      message: "Must be between 1 and 100 in length.",
                    },
                  ],
                },
              },
            },
            name: { _errors: [{ code: "APPLICATION_COMMAND_INVALID_NAME", message: "Bad name." }] },
          },
        },
      },
    });
    const body = [
      { name: "ping", description: "Pong" },
      {
        name: "Bad Name",
        description: "d",
        options: [{ type: 3, name: "reason", description: "" }],
      },
    ];

    const error = await putCommands(rejecting(discordError), "app", "global", body).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RegistrationError);
    const { problems, message, cause } = error as RegistrationError;
    expect(cause).toBe(discordError);
    expect(problems).toEqual([
      {
        command: "Bad Name",
        field: "options.reason.description",
        message: "Must be between 1 and 100 in length.",
      },
      { command: "Bad Name", field: "name", message: "Bad name." },
    ]);
    expect(message).toContain("Bad Name options.reason.description: Must be between");
  });

  test("falls back to Discord's message when there is no field detail", async () => {
    const rest = rejecting(
      Object.assign(new Error("x"), { rawError: { code: 50001, message: "Missing Access" } }),
    );
    const error = await putCommands(rest, "app", { guild: "g" }, []).catch((e: unknown) => e);
    expect((error as RegistrationError).problems).toEqual([
      { command: null, field: "", message: "Missing Access" },
    ]);
    expect((error as RegistrationError).message).toContain("guild:g");
  });

  test("passes other errors through untouched", async () => {
    const network = new Error("ECONNRESET");
    await expect(putCommands(rejecting(network), "app", "global", [])).rejects.toBe(network);
  });
});
