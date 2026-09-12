import { defineCommand } from "@nectar-js/nectar";

/** @type {import("@nectar-js/nectar").CommandMeta} */
export const meta = {
  description: "Roll a die",
  options: [
    { type: "integer", name: "sides", description: "How many sides", minValue: 2, maxValue: 1000 },
  ],
};

// The second argument holds every option by name, null when left out. Without generated types
// it's untyped in JavaScript, but the values are the same.
export default defineCommand("roll", async (interaction, options) => {
  const sides = options.sides ?? 6;
  const rolled = 1 + Math.floor(Math.random() * sides);
  await interaction.reply(`You rolled ${rolled} on a d${sides}.`);
});
