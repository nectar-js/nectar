import { MessageFlags } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { cooldown, guildOnly, requirePermissions, requireRoles } from "../src/policy.js";
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
    options: {},
    env: "test",
    trace: { id: "1", receivedAt: 0, elapsed: () => 0 },
    services: {},
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

describe("cooldown", () => {
  const from = (user: string, guildId: string | null = "g") => ({ user: { id: user }, guildId });

  test("holds a user back until the time passes, and tells them how long", async () => {
    vi.useFakeTimers();
    try {
      const mw = cooldown(10);
      expect((await outcome(mw, from("a"))).ran).toBe(true);
      const again = await outcome(mw, from("a"));
      expect(again.ran).toBe(false);
      expect(again.replied).toEqual({
        content: "Try again in 10s.",
        flags: MessageFlags.Ephemeral,
      });
      expect((await outcome(mw, from("b"))).ran).toBe(true);
      vi.advanceTimersByTime(4000);
      expect((await outcome(mw, from("a"))).replied?.content).toBe("Try again in 6s.");
      vi.advanceTimersByTime(6000);
      expect((await outcome(mw, from("a"))).ran).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("guild and global scopes share one bucket, guild falls back to the user in DMs", async () => {
    const guild = cooldown(60, { scope: "guild" });
    expect((await outcome(guild, from("a"))).ran).toBe(true);
    expect((await outcome(guild, from("b"))).ran).toBe(false);
    expect((await outcome(guild, from("a", null))).ran).toBe(true);
    expect((await outcome(guild, from("b", null))).ran).toBe(true);

    const global = cooldown(60, { scope: "global", message: (s) => `${s} more` });
    expect((await outcome(global, from("a"))).ran).toBe(true);
    expect((await outcome(global, from("b", null))).replied?.content).toBe("60 more");
  });

  test("lets autocomplete through and rejects a non-positive duration", async () => {
    const mw = cooldown(60);
    const respond = vi.fn(async () => {});
    expect((await outcome(mw, { ...from("a"), respond, reply: undefined })).ran).toBe(true);
    expect((await outcome(mw, { ...from("a"), respond, reply: undefined })).ran).toBe(true);
    expect(respond).not.toHaveBeenCalled();
    expect(() => cooldown(0)).toThrow(RangeError);
  });
});
