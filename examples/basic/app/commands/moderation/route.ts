import type { CommandRouteMeta } from "@nectar-js/nectar";

export const meta: CommandRouteMeta = {
  description: "Moderation tools",
  defaultMemberPermissions: 1n << 40n,
};
