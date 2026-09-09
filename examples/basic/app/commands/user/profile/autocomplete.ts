import type { InteractionContext } from "@nect-js/core";
import type { AutocompleteInteraction } from "discord.js";

const SECTIONS = ["overview", "activity", "badges"];

export async function section(ctx: InteractionContext<AutocompleteInteraction>) {
  const typed = ctx.interaction.options.getFocused().toLowerCase();
  await ctx.interaction.respond(
    SECTIONS.filter((s) => s.startsWith(typed)).map((s) => ({ name: s, value: s })),
  );
}
