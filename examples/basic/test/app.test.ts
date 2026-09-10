import { customId } from "@nectar-js/nectar";
import { createTestApp } from "@nectar-js/nectar/testing";
import { Collection, type GuildMember } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commands", () => {
  test("ping reports the time since the root middleware ran", async () => {
    const { responses, context } = await app.command("ping");
    expect(responses).toEqual([
      { method: "reply", options: expect.stringMatching(/^Pong in \d+ms$/) },
    ]);
    expect(context?.startedAt).toBeTypeOf("number");
  });

  test("profile defaults to the caller and the overview", async () => {
    const { responses } = await app.command("user/profile", {}, { user: { tag: "me#0001" } });
    expect(responses).toEqual([{ method: "reply", options: "me#0001: overview" }]);
  });

  test("profile suggests the sections that match what was typed", async () => {
    const { responses } = await app.autocomplete("user/profile", "section", { section: "a" });
    expect(responses).toEqual([
      { method: "respond", options: [{ name: "activity", value: "activity" }] },
    ]);
  });
});

describe("moderation", () => {
  const target = { id: "2", tag: "spammer#0001" };

  test("stops outside a cached guild", async () => {
    const { outcome, context, responses } = await app.command("moderation/ban", { target });
    expect(outcome).toMatchObject({ type: "interaction:complete", handled: false });
    expect(context).toBeNull();
    expect(responses).toEqual([]);
  });

  test("ban bans the target and names the moderator", async () => {
    const ban = vi.fn(async () => {});
    const member = { displayName: "Mod" };
    const { responses, context } = await app.command(
      "moderation/ban",
      { target, reason: "spam" },
      { guild: { members: { ban } }, member },
    );
    expect(context?.member).toBe(member);
    expect(ban).toHaveBeenCalledWith(target, { reason: "spam" });
    expect(responses).toEqual([{ method: "reply", options: "Mod banned spammer#0001: spam" }]);
  });
});

describe("components", () => {
  test("next moves forward and points both buttons at the new page", async () => {
    const { responses } = await app.button("pagination/[page]/next", { page: "1" });
    expect(responses).toMatchObject([
      {
        method: "update",
        options: {
          content: "Page 2",
          components: [
            {
              components: [
                { data: { custom_id: customId("pagination/[page]/prev", { page: "2" }) } },
                { data: { custom_id: customId("pagination/[page]/next", { page: "2" }) } },
              ],
            },
          ],
        },
      },
    ]);
  });

  test("prev stops at the first page", async () => {
    const { responses } = await app.button("pagination/[page]/prev", { page: "1" });
    expect(responses).toMatchObject([{ method: "update", options: { content: "Page 1" } }]);
  });

  test("closing a ticket names who closed it and removes the buttons", async () => {
    const { responses } = await app.button(
      "tickets/[ticketId]/close",
      { ticketId: "42" },
      { user: { tag: "mod#0001" } },
    );
    expect(responses).toEqual([
      { method: "update", options: { content: "Ticket 42 closed by mod#0001", components: [] } },
    ]);
  });

  test("assigning a ticket names the selected user", async () => {
    const users = new Collection([["3", { tag: "helper#0001" }]]);
    const { responses } = await app.select(
      "tickets/[ticketId]/assign",
      { ticketId: "42" },
      { users },
    );
    expect(responses).toEqual([
      { method: "update", options: { content: "Ticket 42 assigned to helper#0001" } },
    ]);
  });
});

describe("events", () => {
  test("new members are welcomed and logged", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const send = vi.fn(async () => {});
    const member = {
      user: { tag: "new#0001" },
      guild: { name: "Guild", systemChannel: { send } },
      toString: () => "<@4>",
    };

    const { failures } = await app.event("guildMemberAdd", member as unknown as GuildMember);
    expect(failures).toEqual([]);
    expect(send).toHaveBeenCalledWith("Welcome, <@4>!");
    expect(log).toHaveBeenCalledWith("[event:guildMemberAdd/(audit)] new#0001 joined Guild");
  });
});

describe("errors", () => {
  test("the root boundary logs the route and passes the error on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = new Error("Unknown interaction");
    const { outcome } = await app.command(
      "ping",
      {},
      {
        reply: async () => {
          throw down;
        },
      },
    );
    expect(outcome).toMatchObject({ type: "interaction:fail", error: down, boundary: null });
    expect(error).toHaveBeenCalledWith("[command:ping]", down);
  });
});
