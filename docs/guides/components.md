# Components

This guide builds a support ticket with a close button, a modal that asks for a reason, and a menu to assign the ticket. Every component carries the ticket's ID in its custom ID.

## Sending components

`/ticket` creates a ticket and replies with the components. `customId` turns a route path and its parameters into a custom ID:

```ts
// app/commands/ticket/command.ts
import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from "discord.js";
import { createTicket } from "../../tickets.ts";

export const meta: CommandMeta = { description: "Open a ticket" };

export default defineCommand("ticket", async (interaction) => {
  const ticket = await createTicket(interaction.user.id);

  const close = new ButtonBuilder()
    .setCustomId(customId("tickets/[ticketId]/close", { ticketId: ticket.id }))
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);

  const assign = new UserSelectMenuBuilder()
    .setCustomId(customId("tickets/[ticketId]/assign", { ticketId: ticket.id }))
    .setPlaceholder("Assign to");

  await interaction.reply({
    content: `Ticket ${ticket.id} opened.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(close),
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(assign),
    ],
  });
});
```

## Buttons

The close button opens a modal. Passing `params` to `customId` hands the ticket's ID on to the modal:

```ts
// app/components/tickets/[ticketId]/close/button.ts
import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default defineComponent("tickets/[ticketId]/close", async (interaction, params) => {
  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason")
    .setStyle(TextInputStyle.Paragraph);

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(customId("tickets/[ticketId]/reason", params))
      .setTitle("Close ticket")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason)),
  );
});
```

The text input keeps a plain custom ID. Nectar only routes the modal itself.

## Modals

```ts
// app/components/tickets/[ticketId]/reason/modal.ts
import { defineComponent } from "@nectar-js/nectar";
import { closeTicket } from "../../../../tickets.ts";

export default defineComponent("tickets/[ticketId]/reason", async (interaction, params) => {
  const reason = interaction.fields.getTextInputValue("reason");
  await closeTicket(params.ticketId, reason);
  await interaction.reply(`Ticket ${params.ticketId} closed: ${reason}`);
});
```

## Select menus

```ts
// app/components/tickets/[ticketId]/assign/select.ts
import { defineComponent } from "@nectar-js/nectar";
import { assignTicket } from "../../../../tickets.ts";

export const kind = "user";

export default defineComponent("tickets/[ticketId]/assign", async (interaction, params) => {
  const user = interaction.users.first();
  if (user === undefined) return;
  await assignTicket(params.ticketId, user.id);
  await interaction.reply(`Assigned to ${user}.`);
});
```

`kind` sets which select menu interaction the handler gets, so it has to match the menu you send. A `UserSelectMenuBuilder` needs `"user"`.

## Several parameters

Values go in route order. `components/polls/[pollId]/[option]/button.ts` takes both:

```ts
customId("polls/[pollId]/[option]", { pollId: poll.id, option: "yes" });
```

## Catch-all parameters

`components/menu/[...path]/button.ts` takes an array:

```ts
customId("menu/[...path]", { path: ["settings", "roles"] });
```

The handler gets `params.path` as `["settings", "roles"]`. Every value counts toward Discord's 100-character limit, so the compiler warns about each catch-all route.

## No parameters

`components/confirm/button.ts` has none, so `customId("confirm")` is enough.

## Components V2

Containers, sections, text displays, and the other discord.js 14.19+ layout components work the same way. Nectar only reads custom IDs, so a button inside a `SectionBuilder` or `ContainerBuilder` routes to its `button.ts` like any other:

```ts
import { ContainerBuilder, MessageFlags, SectionBuilder } from "discord.js";

await interaction.reply({
  flags: MessageFlags.IsComponentsV2,
  components: [
    new ContainerBuilder().addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents((text) => text.setContent(`Ticket ${ticket.id}`))
        .setButtonAccessory(close),
    ),
  ],
});
```

Messages with `IsComponentsV2` can't have `content` or `embeds`. That's Discord's rule, not Nectar's.

## Checking values

A user can change the values in a custom ID. Validate their format with `params`, and check access in the handler:

```ts
export default defineComponent(
  "tickets/[ticketId]/close",
  async (interaction, params) => {
    const ticket = await getTicket(params.ticketId);
    if (ticket.ownerId !== interaction.user.id) {
      await interaction.reply({ content: "Not your ticket.", flags: MessageFlags.Ephemeral });
      return;
    }
    // ...
  },
  { params: { ticketId: (value) => /^\d+$/.test(value) } },
);
```

See [Custom IDs](../concepts/custom-ids) for the format and the checks Nectar runs.
