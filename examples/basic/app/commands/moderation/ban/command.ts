import type { CommandMeta } from "@neatjs/core";

export const meta: CommandMeta = {
  description: "Ban a member",
  options: [
    { type: "user", name: "target", description: "Who to ban", required: true },
    { type: "string", name: "reason", description: "Why", maxLength: 512 },
    {
      type: "integer",
      name: "days",
      description: "Days of messages to delete",
      minValue: 0,
      maxValue: 7,
    },
  ],
};

export default async function () {}
