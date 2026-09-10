import type { APIApplicationCommand } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { diffCommands, normalizeCommand } from "../src/registration/index.js";

/** What Discord returns for a plain `{ name: "ping", description: "Pong" }` registration. */
const remotePing = {
  id: "1",
  application_id: "2",
  version: "3",
  type: 1,
  name: "ping",
  name_localizations: null,
  description: "Pong",
  description_localizations: null,
  default_member_permissions: null,
  dm_permission: true,
  default_permission: true,
  nsfw: false,
  contexts: null,
  integration_types: [0],
} as unknown as APIApplicationCommand;

describe("registration diff", () => {
  test("Discord's default fields do not count as changes", () => {
    const diff = diffCommands([{ name: "ping", description: "Pong" }], [remotePing]);
    expect(diff).toEqual({
      added: [],
      removed: [],
      changed: [],
      unchanged: ["ping"],
      hasChanges: false,
    });
  });

  test("option defaults, ordering of sets, and permission formatting are normalized", () => {
    const desired = normalizeCommand({
      name: "ban",
      description: "Ban",
      default_member_permissions: "4",
      contexts: [1, 0],
      options: [
        { type: 3, name: "reason", description: "Why", required: false, choices: [] },
        { type: 7, name: "where", description: "Where", channel_types: [2, 0] },
      ],
    });
    const remote = normalizeCommand({
      id: "1",
      application_id: "2",
      version: "3",
      type: 1,
      name: "ban",
      description: "Ban",
      default_member_permissions: "4",
      contexts: [0, 1],
      integration_types: [0],
      nsfw: false,
      options: [
        { type: 3, name: "reason", description: "Why", name_localizations: null },
        { type: 7, name: "where", description: "Where", channel_types: [0, 2], required: false },
      ],
    } as unknown as APIApplicationCommand);
    expect(desired).toEqual(remote);
  });

  test("context menus normalize to an empty description", () => {
    expect(normalizeCommand({ name: "Info", type: 2 })).toEqual(
      normalizeCommand({ name: "Info", type: 2, description: "" } as never),
    );
  });

  test("reports added, removed, and changed commands by name", () => {
    const diff = diffCommands(
      [
        { name: "ping", description: "Pong!" },
        { name: "new", description: "New" },
        { name: "Info", type: 2 },
      ],
      [remotePing, { ...remotePing, name: "old" }],
    );
    expect(diff.added).toEqual(["2:Info", "new"]);
    expect(diff.removed).toEqual(["old"]);
    expect(diff.changed).toEqual(["ping"]);
    expect(diff.hasChanges).toBe(true);
  });

  test("the same name with a different type is a different command", () => {
    const diff = diffCommands([{ name: "info", type: 2 }], [{ ...remotePing, name: "info" }]);
    expect(diff.added).toEqual(["2:info"]);
    expect(diff.removed).toEqual(["info"]);
  });
});
