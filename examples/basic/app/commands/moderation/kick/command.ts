import type { CommandMeta } from "@neatjs/core";

export const meta: CommandMeta = {
  description: "Kick a member",
  options: [
    { type: "user", name: "target", description: "Who to kick", required: true },
    { type: "string", name: "reason", description: "Why" },
  ],
};

export default async function () {}
