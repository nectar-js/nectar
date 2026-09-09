import type { CommandRouteMeta } from "@nect-js/core";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
  defaultMemberPermissions: 1n << 40n,
};
