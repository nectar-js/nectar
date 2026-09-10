import { Events } from "discord.js";
import { describe, expect, test } from "vitest";
import type { CompiledEvent } from "../src/events/index.js";
import { checkIntents, requiredIntents } from "../src/events/index.js";

const event = (name: string): CompiledEvent => ({
  name,
  mode: "sequential",
  handlers: [
    {
      route: {
        id: `event:${name}`,
        file: `/app/events/${name}/event.ts`,
      } as CompiledEvent["handlers"][number]["route"],
      once: false,
      order: 0,
    },
  ],
});

describe("checkIntents", () => {
  test("warns once per event whose intent is missing, pointing at the handler", () => {
    const diagnostics = checkIntents(
      [event("guildMemberAdd"), event("clientReady"), event("guildCreate")],
      ["Guilds"],
      "nectar.config.ts",
    );
    expect(diagnostics).toEqual([
      {
        code: "missing-intent",
        severity: "warning",
        message: expect.stringContaining('"GuildMembers" intent'),
        file: "/app/events/guildMemberAdd/event.ts",
        route: "event:guildMemberAdd",
      },
    ]);
    expect(diagnostics[0]?.message).toContain("nectar.config.ts");
    expect(diagnostics[0]?.message).toContain("privileged");
  });

  test("either of two intents satisfies a message event", () => {
    expect(checkIntents([event("messageCreate")], ["DirectMessages"], "c")).toEqual([]);
    expect(checkIntents([event("messageCreate")], ["GuildMessages"], "c")).toEqual([]);
    expect(checkIntents([event("messageCreate")], [], "c")[0]?.message).toContain(
      '"GuildMessages" or "DirectMessages"',
    );
  });

  test("accepts every intent form the config allows", () => {
    const events = [event("guildBanAdd")];
    expect(checkIntents(events, ["GuildModeration"], "c")).toEqual([]);
    expect(checkIntents(events, 4, "c")).toEqual([]);
    expect(checkIntents(events, [4], "c")).toEqual([]);
    expect(checkIntents(events, ["Guilds"], "c")).toHaveLength(1);
  });

  test("the table only names real discord.js events", () => {
    const known = new Set<string>(Object.values(Events));
    for (const name of known) expect(Array.isArray(requiredIntents(name))).toBe(true);
    expect(requiredIntents("interactionCreate")).toEqual([]);
    expect(requiredIntents("presenceUpdate")).toEqual(["GuildPresences"]);
  });
});
