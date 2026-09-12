import type { PermissionResolvable } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import type { InteractionContext, Middleware } from "./runtime/types.js";

/**
 * Opt-in policy middleware. Each returns a middleware that stops the chain and answers the
 * user with a short ephemeral message when the check fails. Registration-time permissions
 * (`meta.defaultMemberPermissions`) are a separate concept: Discord enforces those before the
 * interaction reaches the bot, and server admins can override them. These checks run in the
 * bot and cannot be overridden.
 *
 * Use them from a `middleware.ts`:
 *
 *     export default requirePermissions("BanMembers");
 *
 * Or compose them with your own middleware by calling them inside it.
 */

export interface PolicyOptions {
  /** What the user sees when the check fails. */
  message?: string;
}

/** Passes only interactions that come from a guild. */
export function guildOnly(options: PolicyOptions = {}): Middleware {
  const message = options.message ?? "This only works in a server.";
  return async (ctx, next) => {
    if (!inGuild(ctx)) return deny(ctx, message);
    return next();
  };
}

/** Passes only when the invoking member has every listed permission in the current channel. */
export function requirePermissions(
  permissions: PermissionResolvable,
  options: PolicyOptions = {},
): Middleware {
  const message = options.message ?? "You do not have permission to do that.";
  return async (ctx, next) => {
    if (!inGuild(ctx)) return deny(ctx, message);
    const held = (ctx.interaction as GuildInteractionLike).memberPermissions;
    if (held === null || held === undefined || !held.has(permissions)) return deny(ctx, message);
    return next();
  };
}

export interface RoleOptions extends PolicyOptions {
  /** `"any"` (default) passes with one matching role; `"all"` needs every listed role. */
  mode?: "any" | "all";
}

/** Passes only when the invoking member holds the listed role IDs. */
export function requireRoles(
  roles: string | readonly string[],
  options: RoleOptions = {},
): Middleware {
  const wanted = typeof roles === "string" ? [roles] : [...roles];
  const message = options.message ?? "You do not have the role for that.";
  const mode = options.mode ?? "any";
  return async (ctx, next) => {
    if (!inGuild(ctx)) return deny(ctx, message);
    const held = memberRoles(ctx.interaction as GuildInteractionLike);
    const ok = mode === "all" ? wanted.every((r) => held.has(r)) : wanted.some((r) => held.has(r));
    if (!ok) return deny(ctx, message);
    return next();
  };
}

export interface CooldownOptions {
  /**
   * Who shares a cooldown: each user (default), everyone in a guild, or everyone. In a DM,
   * `"guild"` falls back to the user.
   */
  scope?: "user" | "guild" | "global";
  /** What the user sees while waiting, given the seconds left. */
  message?: string | ((seconds: number) => string);
}

/**
 * Passes once per `seconds` for each route and subject. The cooldown starts when the
 * interaction passes, so a handler that throws still counts. Autocomplete is never held back.
 * Cooldowns live in memory, per process, and reset on restart.
 */
export function cooldown(seconds: number, options: CooldownOptions = {}): Middleware {
  if (!(seconds > 0)) throw new RangeError(`cooldown() needs a positive number of seconds.`);
  const scope = options.scope ?? "user";
  const message = options.message ?? ((left: number) => `Try again in ${left}s.`);
  const until = new Map<string, number>();
  return async (ctx, next) => {
    const i = ctx.interaction as SubjectLike;
    if (typeof i.respond === "function") return next();
    const now = Date.now();
    const key = `${ctx.route.id}\n${subject(i, scope)}`;
    const expires = until.get(key);
    if (expires !== undefined && expires > now) {
      const left = Math.ceil((expires - now) / 1000);
      return deny(ctx, typeof message === "string" ? message : message(left));
    }
    if (until.size >= SWEEP_AT) {
      for (const [k, t] of until) if (t <= now) until.delete(k);
    }
    until.set(key, now + seconds * 1000);
    return next();
  };
}

/** Expired entries are dropped once the map reaches this size, so it stays bounded. */
const SWEEP_AT = 1000;

function subject(i: SubjectLike, scope: NonNullable<CooldownOptions["scope"]>): string {
  if (scope === "global") return "";
  if (scope === "guild" && typeof i.guildId === "string") return `g:${i.guildId}`;
  return `u:${i.user?.id ?? ""}`;
}

interface SubjectLike {
  guildId?: string | null;
  user?: { id: string } | null;
  respond?: unknown;
}

function inGuild(ctx: InteractionContext): boolean {
  const i = ctx.interaction as GuildInteractionLike;
  return typeof i.inGuild === "function" ? i.inGuild() : typeof i.guildId === "string";
}

/**
 * Role IDs of the invoking member. discord.js gives a `GuildMember` with a role cache when the
 * guild is cached and a raw API member with an ID array otherwise.
 */
function memberRoles(interaction: GuildInteractionLike): Set<string> {
  const roles = interaction.member?.roles;
  if (roles === undefined || roles === null) return new Set();
  if (Array.isArray(roles)) return new Set(roles);
  return new Set((roles as { cache: Map<string, unknown> }).cache.keys());
}

/** Answers the user, when the interaction can still be answered, and ends the chain. */
async function deny(ctx: InteractionContext, message: string): Promise<void> {
  const i = ctx.interaction as RepliableLike;
  if (typeof i.respond === "function") {
    // Autocomplete cannot show a message. An empty list is the only quiet answer.
    if (!i.responded) await i.respond([]);
    return;
  }
  if (typeof i.reply !== "function" || i.replied || i.deferred) return;
  await i.reply({ content: message, flags: MessageFlags.Ephemeral });
}

interface GuildInteractionLike {
  inGuild?: () => boolean;
  guildId?: string | null;
  memberPermissions?: { has(permission: PermissionResolvable): boolean } | null;
  member?: { roles: readonly string[] | { cache: Map<string, unknown> } } | null;
}

interface RepliableLike {
  replied?: boolean;
  deferred?: boolean;
  responded?: boolean;
  reply?: (options: { content: string; flags: MessageFlags }) => Promise<unknown>;
  respond?: (choices: never[]) => Promise<unknown>;
}
