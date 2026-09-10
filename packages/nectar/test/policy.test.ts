import { MessageFlags } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { guildOnly, requirePermissions, requireRoles } from "../src/policy.js";
import { runChain } from "../src/runtime/index.js";
import type { InteractionContext, Middleware } from "../src/runtime/types.js";

function ctx(interaction: Record<string, unknown>): InteractionContext {
  return {
    interaction: {
      replied: false,
      deferred: false,
      reply: vi.fn(async () => {}),
      ...interaction,
    } as unknown as InteractionContext["interaction"],
    client: {} as InteractionContext["client"],
    route: { id: "command:x", category: "command", path: "x", file: "x" },
    params: {},
    env: "test",
    trace: { id: "1", receivedAt: 0, elapsed: () => 0 },
  };
}

async function outcome(middleware: Middleware, interaction: Record<string, unknown>) {
  const c = ctx(interaction);
  let ran = false;
  await runChain([middleware], c, () => {
    ran = true;
  });
  const reply = (c.interaction as unknown as { reply?: ReturnType<typeof vi.fn> }).reply;
  return {
    ran,
    replied: reply?.mock.calls[0]?.[0] as { content: string; flags: number } | undefined,
  };
}

const inGuild = { inGuild: () => true, guildId: "g" };
const inDm = { inGuild: () => false, guildId: null };

describe("guildOnly", () => {
  test("passes in a guild, denies elsewhere with an ephemeral reply", async () => {
    expect(await outcome(guildOnly(), inGuild)).toEqual({ ran: true, replied: undefined });
    expect(await outcome(guildOnly({ message: "Servers only." }), inDm)).toEqual({
      ran: false,
      replied: { content: "Servers only.", flags: MessageFlags.Ephemeral },
    });
  });

  test("does not reply twice or to a deferred interaction", async () => {
    expect((await outcome(guildOnly(), { ...inDm, deferred: true })).replied).toBeUndefined();
  });

  test("answers autocomplete with an empty list", async () => {
    const respond = vi.fn(async () => {});
    const result = await outcome(guildOnly(), {
      ...inDm,
      respond,
      responded: false,
      reply: undefined,
    });
    expect(result.ran).toBe(false);
    expect(respond).toHaveBeenCalledWith([]);
  });
});

describe("requirePermissions", () => {
  const withPermissions = (...held: string[]) => ({
    ...inGuild,
    memberPermissions: { has: (p: string | string[]) => [p].flat().every((x) => held.includes(x)) },
  });

  test("checks the member's permissions in the channel", async () => {
    const mw = requirePermissions("BanMembers");
    expect((await outcome(mw, withPermissions("BanMembers"))).ran).toBe(true);
    const denied = await outcome(mw, withPermissions("KickMembers"));
    expect(denied.ran).toBe(false);
    expect(denied.replied?.content).toBe("You do not have permission to do that.");
  });

  test("denies outside a guild and when permissions are unavailable", async () => {
    const mw = requirePermissions("BanMembers");
    expect((await outcome(mw, inDm)).ran).toBe(false);
    expect((await outcome(mw, { ...inGuild, memberPermissions: null })).ran).toBe(false);
  });
});

describe("requireRoles", () => {
  const cached = (...ids: string[]) => ({
    ...inGuild,
    member: { roles: { cache: new Map(ids.map((id) => [id, {}])) } },
  });
  const raw = (...ids: string[]) => ({ ...inGuild, member: { roles: ids } });

  test("any of the roles by default, from a cached or raw member", async () => {
    const mw = requireRoles(["mod", "admin"]);
    expect((await outcome(mw, cached("admin"))).ran).toBe(true);
    expect((await outcome(mw, raw("mod"))).ran).toBe(true);
    expect((await outcome(mw, raw("member"))).ran).toBe(false);
    expect((await outcome(mw, inDm)).ran).toBe(false);
  });

  test("all of the roles when asked", async () => {
    const mw = requireRoles(["mod", "verified"], { mode: "all" });
    expect((await outcome(mw, raw("mod"))).ran).toBe(false);
    expect((await outcome(mw, raw("mod", "verified", "extra"))).ran).toBe(true);
  });

  test("a single role ID", async () => {
    expect((await outcome(requireRoles("mod"), raw("mod"))).ran).toBe(true);
  });
});
