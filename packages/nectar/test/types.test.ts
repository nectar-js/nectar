/**
 * Type-level checks. They run under `pnpm typecheck`; vitest only sees the runtime shells.
 * The augmentation below stands in for a generated `.nectar/types.d.ts`.
 */
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
} from "discord.js";
import { describe, expectTypeOf, test } from "vitest";
import {
  type CommandContext,
  type ComponentContext,
  customId,
  defineCommand,
  defineComponent,
  defineEvent,
  defineMiddleware,
  type MiddlewareExtension,
} from "../src/index.js";

const auth = defineMiddleware(async (ctx, next) => {
  const member = ctx.interaction.member as GuildMember;
  return next({ member });
});

const passthrough = defineMiddleware(async (_ctx, next) => {
  await next();
});

type Empty = Record<never, never>;
type AuthModule = { default: typeof auth };
type PassthroughModule = { default: typeof passthrough };

declare module "../src/index.js" {
  interface NectarRoutes {
    commands: {
      ping: { type: "chatInput"; options: Empty; context: Empty };
      "moderation/ban": {
        type: "chatInput";
        options: { target: "user"; reason: "string" };
        context: MiddlewareExtension<AuthModule>;
      };
      info: { type: "user"; options: Empty; context: Empty };
      "admin/roles/give": {
        type: "chatInput";
        options: { role: "role"; days: "integer" };
        context: Empty;
      };
    };
    components: {
      confirm: { kind: "button"; params: Empty; context: Empty };
      "tickets/[ticketId]/close": {
        kind: "button";
        params: { ticketId: string };
        context: MiddlewareExtension<AuthModule> & MiddlewareExtension<PassthroughModule>;
      };
      "tickets/[ticketId]/assign": {
        kind: "select:user";
        params: { ticketId: string };
        context: Empty;
      };
      "wizard/[id]/[...steps]": {
        kind: "button" | "modal";
        params: { id: string; steps: string[] };
        context: Empty;
      };
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

describe("contexts", () => {
  test("component context narrows the interaction, params, and middleware additions", () => {
    type Close = ComponentContext<"tickets/[ticketId]/close">;
    expectTypeOf<Close["interaction"]>().toEqualTypeOf<ButtonInteraction>();
    expectTypeOf<Close["params"]["ticketId"]>().toEqualTypeOf<string>();
    expectTypeOf<Close["member"]>().toEqualTypeOf<GuildMember>();

    type Assign = ComponentContext<"tickets/[ticketId]/assign">;
    expectTypeOf<Assign["interaction"]>().toEqualTypeOf<UserSelectMenuInteraction>();
    expectTypeOf<Assign>().not.toHaveProperty("member");
  });

  test("command context follows the command type", () => {
    expectTypeOf<
      CommandContext<"ping">["interaction"]
    >().toEqualTypeOf<ChatInputCommandInteraction>();
    expectTypeOf<
      CommandContext<"info">["interaction"]
    >().toEqualTypeOf<UserContextMenuCommandInteraction>();
    expectTypeOf<CommandContext<"moderation/ban">["member"]>().toEqualTypeOf<GuildMember>();
  });

  test("define helpers check the path and type the handler", () => {
    defineComponent("tickets/[ticketId]/close", async (ctx) => {
      expectTypeOf(ctx.params.ticketId).toEqualTypeOf<string>();
      expectTypeOf(ctx.member).toEqualTypeOf<GuildMember>();
      // @ts-expect-error not a param of this route
      ctx.params.nope;
    });
    // @ts-expect-error unknown route
    defineComponent("nope", async () => {});
    // @ts-expect-error unknown command
    defineCommand("nope", async () => {});
    defineEvent("guildMemberAdd", async (member, ctx) => {
      expectTypeOf(member).toEqualTypeOf<GuildMember>();
      expectTypeOf(ctx.route.id).toEqualTypeOf<string>();
    });
    // @ts-expect-error not a discord.js event
    defineEvent("nope", async () => {});
  });

  test("middleware extension is inferred from the returned next() call", () => {
    expectTypeOf<MiddlewareExtension<AuthModule>>().toEqualTypeOf<{ member: GuildMember }>();
    expectTypeOf<MiddlewareExtension<PassthroughModule>>().toEqualTypeOf<Record<never, never>>();
    expectTypeOf<MiddlewareExtension<{ default: () => void }>>().toEqualTypeOf<
      Record<never, never>
    >();
  });
});
