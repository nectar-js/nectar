process.env.TICKETS_DB = ":memory:";

import { customId } from "@nectar-js/nectar";
import { createTestApp } from "@nectar-js/nectar/testing";
import { Collection, MessageFlags } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { closeTicket, openTicket, openTickets, pruneClosedTickets } from "../app/tickets.ts";

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

/** In the server, with a member, so inGuild() and guildOnly pass. Each user has their own cooldown. */
const member = (id: string) => ({ guildId: "g", member: {}, user: { id } });

afterEach(() => {
  vi.restoreAllMocks();
});

async function open(subject: string, user: string): Promise<string> {
  const { responses } = await app.command("ticket/open", { subject }, member(user));
  // Builders serialize through toJSON, so the custom IDs of the nested components show up.
  const card = JSON.stringify(responses[0]?.options);
  return /n:\w{6}:(\d+)/.exec(card)?.[1] ?? "";
}

describe("/ticket open", () => {
  test("stores the ticket and replies with a Components V2 card carrying its ID", async () => {
    const { responses } = await app.command("ticket/open", { subject: "Login" }, member("10"));
    const [ticket] = openTickets().filter((t) => t.subject === "Login");
    expect(ticket).toMatchObject({ openedBy: "10", assignee: null, closedAt: null });
    const ticketId = String(ticket?.id);
    expect(responses).toMatchObject([
      {
        method: "reply",
        options: {
          flags: MessageFlags.IsComponentsV2,
          components: [
            {
              components: [
                { data: { content: expect.stringContaining(`Ticket #${ticketId}`) } },
                {
                  components: [
                    { data: { custom_id: customId("tickets/[ticketId]/close", { ticketId }) } },
                  ],
                },
                {
                  components: [
                    { data: { custom_id: customId("tickets/[ticketId]/assign", { ticketId }) } },
                  ],
                },
              ],
            },
          ],
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
  test("defers, then lists open tickets with their assignee", async () => {
    const id = await open("Listed", "40");
    const { responses } = await app.command("ticket/list", {}, member("40"));
    expect(responses[0]).toEqual({
      method: "deferReply",
      options: { flags: MessageFlags.Ephemeral },
    });
    expect(responses[1]).toMatchObject({
      method: "editReply",
      options: expect.stringContaining(`#${id} Listed (unassigned)`),
    });
  });
});

describe("components", () => {
  test("assigning a ticket stores the assignee", async () => {
    const id = await open("Assign me", "50");
    const users = new Collection([["3", { id: "3" }]]);
    const { responses } = await app.select(
      "tickets/[ticketId]/assign",
      { ticketId: id },
      { users },
    );
    expect(responses).toEqual([{ method: "reply", options: `Ticket #${id} assigned to <@3>.` }]);
    expect(openTickets().find((t) => String(t.id) === id)?.assignee).toBe("3");
  });

  test("close opens a modal, and the modal closes the ticket with the reason", async () => {
    const id = await open("Close me", "60");
    const { responses } = await app.button("tickets/[ticketId]/close", { ticketId: id });
    expect(responses).toMatchObject([
      {
        method: "showModal",
        options: { data: { custom_id: customId("tickets/[ticketId]/reason", { ticketId: id }) } },
      },
    ]);

    const closed = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId: id },
      { user: { id: "60" }, fields: { getTextInputValue: () => "fixed" } },
    );
    expect(closed.responses).toEqual([
      { method: "reply", options: `Ticket #${id} closed by <@60>: fixed` },
    ]);
    expect(openTickets().some((t) => String(t.id) === id)).toBe(false);
  });

  test("a closed or unknown ticket is answered by the tickets error boundary", async () => {
    const { outcome, responses } = await app.modal(
      "tickets/[ticketId]/reason",
      { ticketId: "999999" },
      { fields: { getTextInputValue: () => "late" } },
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
    const { outcome } = await app.button("tickets/[ticketId]/close", { ticketId: "1 OR 1=1" });
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
