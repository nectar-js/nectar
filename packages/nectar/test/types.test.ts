/**
 * Type-level checks. They run under `pnpm typecheck`; vitest only sees the runtime shells.
 * The augmentation below stands in for a generated `.nectar/types.d.ts`.
 */
import type {
  APIRole,
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  Role,
  User,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
} from "discord.js";
import { describe, expectTypeOf, test } from "vitest";
import {
  type CommandInteractionOf,
  type ComponentInteractionOf,
  type ComponentParams,
  customId,
  defineCommand,
  defineComponent,
  defineEvent,
  defineMiddleware,
  type OptionValues,
  stop,
  use,
} from "../src/index.js";

type Empty = Record<never, never>;

declare module "../src/index.js" {
  interface NectarRoutes {
    commands: {
      ping: { type: "chatInput"; options: Empty };
      "moderation/ban": {
        type: "chatInput";
        options: {
          target: { type: "user"; required: true };
          reason: { type: "string"; required: false };
        };
      };
      info: { type: "user"; options: Empty };
      slow: { type: "chatInput"; options: Empty };
      whoami: { type: "chatInput"; options: Empty };
      "admin/roles/give": {
        type: "chatInput";
        options: {
          role: { type: "role"; required: true };
          days: { type: "integer"; required: false };
        };
      };
    };
    components: {
      confirm: { kind: "button"; params: Empty };
      "tickets/[ticketId]/close": { kind: "button"; params: { ticketId: string } };
      "tickets/[ticketId]/assign": { kind: "select:user"; params: { ticketId: string } };
      "wizard/[id]/[...steps]": { kind: "modal"; params: { id: string; steps: string[] } };
    };
    events: { clientReady: true };
    autocomplete: { "moderation/ban": "reason" };
  }
}

describe("customId", () => {
  test("params follow the route", () => {
    expectTypeOf(customId).toBeCallableWith("confirm");
    expectTypeOf(customId).toBeCallableWith("tickets/[ticketId]/close", { ticketId: "1" });
    expectTypeOf(customId).toBeCallableWith("wizard/[id]/[...steps]", { id: "1", steps: ["a"] });

    // Never called: these only need to fail type checking.
    const rejected = () => {
      // @ts-expect-error unknown route
      customId("nope");
      // @ts-expect-error missing param
      customId("tickets/[ticketId]/close");
      // @ts-expect-error wrong param name
      customId("tickets/[ticketId]/close", { ticketID: "1" });
      // @ts-expect-error catch-all takes an array
      customId("wizard/[id]/[...steps]", { id: "1", steps: "a" });
    };
    expectTypeOf(rejected).toBeFunction();
  });
});

describe("handlers", () => {
  test("component handlers get the interaction for their kind and typed params", () => {
    expectTypeOf<
      ComponentInteractionOf<"tickets/[ticketId]/close">
    >().toEqualTypeOf<ButtonInteraction>();
    expectTypeOf<
      ComponentInteractionOf<"tickets/[ticketId]/assign">
    >().toEqualTypeOf<UserSelectMenuInteraction>();
    expectTypeOf<ComponentParams<"wizard/[id]/[...steps]">["steps"]>().toEqualTypeOf<string[]>();

    defineComponent("tickets/[ticketId]/close", async (interaction, params) => {
      expectTypeOf(interaction).toEqualTypeOf<ButtonInteraction>();
      expectTypeOf(params.ticketId).toEqualTypeOf<string>();
      // @ts-expect-error not a param of this route
      params.nope;
    });
    // @ts-expect-error unknown route
    defineComponent("nope", async () => {});
  });

  test("command handlers get the interaction for their type and typed options", () => {
    expectTypeOf<CommandInteractionOf<"ping">>().toEqualTypeOf<ChatInputCommandInteraction>();
    expectTypeOf<CommandInteractionOf<"info">>().toEqualTypeOf<UserContextMenuCommandInteraction>();

    type Ban = OptionValues<"moderation/ban">;
    expectTypeOf<Ban["target"]>().toEqualTypeOf<User>();
    expectTypeOf<Ban["reason"]>().toEqualTypeOf<string | null>();
    type Give = OptionValues<"admin/roles/give">;
    expectTypeOf<Give["days"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Give["role"]>().toEqualTypeOf<Role | APIRole>();
    expectTypeOf<OptionValues<"ping">>().toEqualTypeOf<Empty>();

    defineCommand("moderation/ban", async (interaction, { target, reason }) => {
      expectTypeOf(interaction).toEqualTypeOf<ChatInputCommandInteraction>();
      expectTypeOf(target).toEqualTypeOf<User>();
      expectTypeOf(reason).toEqualTypeOf<string | null>();
    });
    defineCommand("moderation/ban", async (_interaction, options) => {
      // @ts-expect-error not an option of this command
      options.nope;
    });
    // @ts-expect-error unknown command
    defineCommand("nope", async () => {});
  });

  test("event handlers get the discord.js listener arguments", () => {
    defineEvent("guildMemberAdd", async (member) => {
      expectTypeOf(member).toEqualTypeOf<GuildMember>();
    });
    // @ts-expect-error not a discord.js event
    defineEvent("nope", async () => {});
  });
});

describe("middleware", () => {
  test("use() is typed from what the middleware returns, without stop", () => {
    const auth = defineMiddleware(async (interaction) => {
      if (!interaction.inCachedGuild()) return stop;
      return { member: interaction.member };
    });
    const passthrough = defineMiddleware(async () => {});
    const sync = defineMiddleware(() => 42);

    // Never called: use() needs a running route, and only the types matter here.
    const inHandler = () => {
      expectTypeOf(use(auth)).toEqualTypeOf<{ member: GuildMember }>();
      expectTypeOf(use(passthrough)).toEqualTypeOf<void>();
      expectTypeOf(use(sync)).toEqualTypeOf<number>();
    };
    expectTypeOf(inHandler).toBeFunction();
  });
});
