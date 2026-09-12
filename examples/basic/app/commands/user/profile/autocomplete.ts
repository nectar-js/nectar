import type { AutocompleteInteraction } from "discord.js";

const SECTIONS = ["overview", "activity", "badges"];

export async function section(interaction: AutocompleteInteraction) {
  const typed = interaction.options.getFocused().toLowerCase();
  await interaction.respond(
    SECTIONS.filter((s) => s.startsWith(typed)).map((s) => ({ name: s, value: s })),
  );
}
