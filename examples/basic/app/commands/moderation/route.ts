import type { CommandRouteMeta } from "@neatjs/core";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
  defaultMemberPermissions: 1n << 40n,
};
