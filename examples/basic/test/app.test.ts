import { customId } from "@nectar-js/nectar";
import { createTestApp } from "@nectar-js/nectar/testing";
import { Collection, type GuildMember, MessageFlags } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commands", () => {
  test("ping reports the time since the root middleware ran", async () => {
    const { responses } = await app.command("ping");
    expect(responses).toEqual([
      { method: "reply", options: expect.stringMatching(/^Pong in \d+ms$/) },
    ]);
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
    const { outcome, responses } = await app.command("moderation/ban", { target });
    expect(outcome).toMatchObject({ type: "interaction:complete", handled: false });
    expect(responses).toEqual([]);
  });

  test("ban bans the target and names the moderator", async () => {
    const ban = vi.fn(async () => {});
    const member = { displayName: "Mod" };
    const { responses } = await app.command(
      "moderation/ban",
      { target, reason: "spam" },
      { guild: { members: { ban } }, member },
    );
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
});

describe("tickets", () => {
  /** Opens a ticket through /ticket and returns its ID from the reply. */
  async function open(subject: string): Promise<string> {
    const { responses } = await app.command("ticket", { subject }, { user: { id: "1" } });
    const reply = responses[0] as { options: { content: string } };
    return /^Ticket (\d+) opened/.exec(reply.options.content)?.[1] ?? "";
  }

  test("/ticket replies with a close button and an assign menu for the new ticket", async () => {
    const { responses } = await app.command("ticket", { subject: "Login" }, { user: { id: "1" } });
    expect(responses).toMatchObject([
      {
        method: "reply",
        options: {
          content: expect.stringMatching(/^Ticket \d+ opened: Login$/),
          components: [
            { components: [{ data: { custom_id: expect.stringMatching(/^n:31imou:\d+$/) } }] },
            { components: [{ data: { custom_id: expect.stringMatching(/^n:1x540s:\d+$/) } }] },
          ],
        },
      },
    ]);
  });

  test("assigning a ticket names the selected user", async () => {
    const ticketId = await open("Billing");
    const users = new Collection([["3", { id: "3", tag: "helper#0001" }]]);
    const { responses } = await app.select("tickets/[ticketId]/assign", { ticketId }, { users });
    expect(responses).toEqual([
      { method: "update", options: { content: `Ticket ${ticketId} assigned to helper#0001` } },
    ]);
  });

  test("closing asks for a reason in a modal, and the modal closes the ticket", async () => {
    const ticketId = await open("Crash");
    const { responses } = await app.button("tickets/[ticketId]/close", { ticketId });
    expect(responses).toMatchObject([
      {
        method: "showModal",
        options: { data: { custom_id: customId("tickets/[ticketId]/reason", { ticketId }) } },
      },
    ]);

    const closed = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId },
      { user: { tag: "mod#0001" }, fields: { getTextInputValue: () => "fixed" } },
    );
    expect(closed.responses).toEqual([
      { method: "reply", options: `Ticket ${ticketId} closed by mod#0001: fixed` },
    ]);
  });

  test("a ticket that no longer exists is answered by the tickets error boundary", async () => {
    const { outcome, responses } = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId: "999" },
      { fields: { getTextInputValue: () => "late" } },
    );
    expect(outcome).toMatchObject({
      type: "interaction:fail",
      boundary: expect.stringMatching(/components[\\/]tickets[\\/]error\.ts$/),
    });
    expect(responses).toEqual([
      {
        method: "reply",
        options: { content: "That ticket no longer exists.", flags: MessageFlags.Ephemeral },
      },
    ]);
  });

  test("a custom ID with a non-numeric ticket ID is rejected before the handler", async () => {
    const { outcome } = await app.button("tickets/[ticketId]/close", { ticketId: "abc" });
    expect(outcome).toMatchObject({
      type: "interaction:reject",
      reason: "invalid-param",
      param: "ticketId",
    });
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

describe("context menus", () => {
  test("Avatar replies with the target's avatar", async () => {
    const { responses } = await app.command(
      "avatar",
      {},
      {
        targetUser: {
          displayAvatarURL: ({ size }: { size: number }) => `https://cdn/avatar?size=${size}`,
        },
      },
    );
    expect(responses).toEqual([{ method: "reply", options: "https://cdn/avatar?size=512" }]);
  });
});
