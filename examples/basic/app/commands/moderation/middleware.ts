import { defineMiddleware } from "@nect-js/core";
import type { GuildMember } from "discord.js";

export default defineMiddleware(async (ctx, next) => {
  if (!ctx.interaction.inCachedGuild()) return;
  const member: GuildMember = ctx.interaction.member;
  return next({ member });
});
