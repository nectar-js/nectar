import type { CommandMeta } from "@neatjs/core";

export const meta: CommandMeta = {
  description: "Show a profile",
  options: [
    { type: "user", name: "target", description: "Who to look up" },
    { type: "string", name: "section", description: "Which section to show", autocomplete: true },
  ],
};

export default async function () {}
