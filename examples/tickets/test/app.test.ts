process.env.TICKETS_DB = ":memory:";

import { customId } from "@nectar-js/nectar";
import { createTestApp } from "@nectar-js/nectar/testing";
import { ChannelType, Collection, MessageFlags, PermissionFlagsBits } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { closeTicket, openTicket, openTickets, pruneClosedTickets } from "../app/tickets.ts";

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));
// The bot's own user, which the channel overwrites name. Never set on a client that doesn't log in.
Object.assign(app.client, { user: { id: "bot" } });

/** Just enough of a guild: channels are created, fetched by ID, and deleted. */
function fakeGuild() {
  const channels = new Map<string, FakeChannel>();
  let next = 100;
  return {
    id: "g",
    channels: {
      create: vi.fn(async (options: { name: string }) => {
        const channel: FakeChannel = {
          id: String(next++),
          name: options.name,
          type: ChannelType.GuildText,
          send: vi.fn(async () => {}),
          delete: vi.fn(async () => {
            channels.delete(channel.id);
          }),
          permissionOverwrites: { create: vi.fn(async () => {}) },
        };
        channels.set(channel.id, channel);
        return channel;
      }),
      fetch: vi.fn(async (id: string) => channels.get(id) ?? null),
    },
    channelsById: channels,
  };
}

interface FakeChannel {
  id: string;
  name: string;
  type: ChannelType;
  send: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  permissionOverwrites: { create: ReturnType<typeof vi.fn> };
}

const guild = fakeGuild();

/** In the server, with a member, so inGuild() and guildOnly pass. Each user has its own cooldown. */
const member = (id: string) => ({ guildId: "g", guild, member: {}, user: { id } });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Opens a ticket and returns it with its channel. */
async function open(subject: string, user: string) {
  await app.command("ticket/open", { subject }, member(user));
  const ticket = openTickets().find((t) => t.subject === subject);
  if (ticket?.channelId == null) throw new Error(`No channel for ${subject}.`);
  const channel = guild.channelsById.get(ticket.channelId);
  if (channel === undefined) throw new Error(`Channel ${ticket.channelId} is gone.`);
  return { ticketId: String(ticket.id), channel };
}

describe("/ticket open", () => {
  test("creates a private channel, posts the card there, and tells the opener where", async () => {
    const { responses } = await app.command("ticket/open", { subject: "Login" }, member("10"));
    const [ticket] = openTickets().filter((t) => t.subject === "Login");
    expect(ticket).toMatchObject({ openedBy: "10", assignee: null, closedAt: null });
    const ticketId = String(ticket?.id);

    expect(guild.channels.create).toHaveBeenLastCalledWith({
      name: `ticket-${ticketId}`,
      type: ChannelType.GuildText,
      topic: "Login",
      permissionOverwrites: [
        { id: "g", deny: [PermissionFlagsBits.ViewChannel] },
        { id: "10", allow: expect.arrayContaining([PermissionFlagsBits.ViewChannel]) },
        { id: "bot", allow: expect.arrayContaining([PermissionFlagsBits.ViewChannel]) },
      ],
    });
    const channel = guild.channelsById.get(ticket?.channelId ?? "");
    expect(channel?.send).toHaveBeenCalledWith({
      flags: MessageFlags.IsComponentsV2,
      components: [expect.anything()],
    });
    // The card carries the ticket ID in both component custom IDs.
    const card = JSON.stringify(channel?.send.mock.calls[0]);
    expect(card).toContain(customId("tickets/[ticketId]/close", { ticketId }));
    expect(card).toContain(customId("tickets/[ticketId]/assign", { ticketId }));

    expect(responses).toEqual([
      {
        method: "reply",
        options: {
          content: `Ticket #${ticketId} opened in <#${channel?.id}>.`,
          flags: MessageFlags.Ephemeral,
        },
      },
    ]);
  });

  test("is held back by the cooldown for the same user", async () => {
    await open("First", "20");
    const { outcome, responses } = await app.command(
      "ticket/open",
      { subject: "Second" },
      member("20"),
    );
    expect(outcome).toMatchObject({ type: "interaction:complete", handled: false });
    expect(responses).toEqual([
      {
        method: "reply",
        options: {
          content: "Slow down. You can open another ticket in 30s.",
          flags: MessageFlags.Ephemeral,
        },
      },
    ]);
  });

  test("only works in a server", async () => {
    const { outcome, responses } = await app.command(
      "ticket/open",
      { subject: "DM" },
      { user: { id: "30" } },
    );
    expect(outcome).toMatchObject({ type: "interaction:complete", handled: false });
    expect(responses).toEqual([
      {
        method: "reply",
        options: { content: "Open tickets from inside the server.", flags: MessageFlags.Ephemeral },
      },
    ]);
  });
});

describe("/ticket list", () => {
  test("defers, then lists open tickets with their channel and assignee", async () => {
    const { ticketId, channel } = await open("Listed", "40");
    const { responses } = await app.command("ticket/list", {}, member("40"));
    expect(responses[0]).toEqual({
      method: "deferReply",
      options: { flags: MessageFlags.Ephemeral },
    });
    expect(responses[1]).toMatchObject({
      method: "editReply",
      options: expect.stringContaining(`#${ticketId} Listed in <#${channel.id}> (unassigned)`),
    });
  });
});

describe("components", () => {
  test("assigning stores the assignee and lets them into the channel", async () => {
    const { ticketId, channel } = await open("Assign me", "50");
    const users = new Collection([["3", { id: "3" }]]);
    const { responses } = await app.select(
      "tickets/[ticketId]/assign",
      { ticketId },
      { ...member("50"), users },
    );
    expect(responses).toEqual([
      { method: "reply", options: `Ticket #${ticketId} assigned to <@3>.` },
    ]);
    expect(openTickets().find((t) => String(t.id) === ticketId)?.assignee).toBe("3");
    expect(channel.permissionOverwrites.create).toHaveBeenCalledWith("3", {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  });

  test("close opens a modal, and the modal closes the ticket and deletes its channel", async () => {
    const { ticketId, channel } = await open("Close me", "60");
    const { responses } = await app.button("tickets/[ticketId]/close", { ticketId }, member("60"));
    expect(responses).toMatchObject([
      {
        method: "showModal",
        options: { data: { custom_id: customId("tickets/[ticketId]/reason", { ticketId }) } },
      },
    ]);

    const closed = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId },
      {
        ...member("60"),
        user: { id: "60", tag: "mod#0001" },
        fields: { getTextInputValue: () => "fixed" },
      },
    );
    expect(closed.responses).toEqual([
      {
        method: "reply",
        options: { content: `Ticket #${ticketId} closed: fixed`, flags: MessageFlags.Ephemeral },
      },
    ]);
    expect(channel.delete).toHaveBeenCalledWith(`Ticket #${ticketId} closed by mod#0001: fixed`);
    expect(openTickets().some((t) => String(t.id) === ticketId)).toBe(false);
  });

  test("a closed or unknown ticket is answered by the tickets error boundary", async () => {
    const { outcome, responses } = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId: "999999" },
      { ...member("61"), fields: { getTextInputValue: () => "late" } },
    );
    expect(outcome).toMatchObject({
      type: "interaction:fail",
      boundary: expect.stringMatching(/components[\\/]tickets[\\/]error\.ts$/),
    });
    expect(responses).toEqual([
      {
        method: "reply",
        options: { content: "That ticket is already closed.", flags: MessageFlags.Ephemeral },
      },
    ]);
  });

  test("a tampered ticket ID never reaches the handler", async () => {
    const { outcome } = await app.button(
      "tickets/[ticketId]/close",
      { ticketId: "1 OR 1=1" },
      member("62"),
    );
    expect(outcome).toMatchObject({
      type: "interaction:reject",
      reason: "invalid-param",
      param: "ticketId",
    });
  });
});

describe("pruning", () => {
  test("removes tickets closed before the cutoff and keeps the rest", async () => {
    const old = openTicket("Old", "70");
    closeTicket(String(old.id), "done");
    const fresh = openTicket("Fresh", "70");
    // Other tests closed tickets in this database too, so only the lower bound is fixed.
    expect(pruneClosedTickets(Date.now() + 1)).toBeGreaterThanOrEqual(1);
    expect(openTickets().some((t) => t.id === fresh.id)).toBe(true);
    expect(pruneClosedTickets(Date.now() + 1)).toBe(0);
  });
});
