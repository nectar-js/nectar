import { defineCommand } from "@nectar-js/nectar";

/** @type {import("@nectar-js/nectar").CommandMeta} */
export const meta = {
  description: "Roll a die",
  options: [
    { type: "integer", name: "sides", description: "How many sides", minValue: 2, maxValue: 1000 },
  ],
};

// ctx.options holds every option by name, null when left out. Without generated types it's
// untyped in JavaScript, but the values are the same.
export default defineCommand("roll", async (ctx) => {
  const sides = ctx.options.sides ?? 6;
  const rolled = 1 + Math.floor(Math.random() * sides);
  await ctx.interaction.reply(`You rolled ${rolled} on a d${sides}.`);
});
