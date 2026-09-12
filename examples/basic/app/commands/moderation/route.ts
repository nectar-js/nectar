import type { CommandRouteMeta } from "@nectar-js/nectar";
import { PermissionFlagsBits } from "discord.js";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
  defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
};
