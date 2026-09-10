import { fileURLToPath } from "node:url";
import {
  type AnySelectMenuInteraction,
  type Attachment,
  type AutocompleteInteraction,
  BaseInteraction,
  type ButtonInteraction,
  type Channel,
  Client,
  type ClientEvents,
  CommandInteractionOptionResolver,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type Role,
  SnowflakeUtil,
  type User,
} from "discord.js";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionType,
} from "discord-api-types/v10";
import type { OptionType } from "./commands/meta.js";
import { customIdFor, registerComponentRoutes, type SelectKind } from "./components/index.js";
import type {
  CommandContext,
  CommandPath,
  CommandRoutes,
  ComponentContext,
  ComponentParams,
  ComponentPath,
} from "./define.js";
import type { NectarRoutes, NectarServices } from "./index.js";
import {
  loadManifest,
  type Manifest,
  type ManifestCommand,
  type ManifestComponentRoute,
} from "./manifest/index.js";
import {
  bindEvents,
  createInteractionDispatcher,
  createLogger,
  createSignals,
  type Env,
  type Logger,
  ModuleRegistry,
  type RuntimeState,
  type Signal,
} from "./runtime/index.js";

type Empty = Record<never, never>;

/**
 * A stand-in for a discord.js object. Property names are checked against the real type;
 * values are not, so pass whatever the handler reads, like `guild`, `member`, or `values`.
 */
export type StubFields<T> = T extends unknown ? { [K in keyof T]?: unknown } : never;

/** What a test passes for each option type. */
interface OptionValues {
  string: string;
  integer: number;
  number: number;
  boolean: boolean;
  user: StubFields<User>;
  channel: StubFields<Channel>;
  role: StubFields<Role>;
  mentionable: StubFields<User | GuildMember | Role>;
  attachment: StubFields<Attachment>;
}

type OptionTypes<P extends CommandPath> = CommandRoutes[P] extends { options: infer O }
  ? O
  : Record<string, OptionType>;

/** Option values by name, typed from the command's generated options. */
export type CommandOptions<P extends CommandPath> = {
  [K in keyof OptionTypes<P>]?: OptionValues[OptionTypes<P>[K] & OptionType];
};

type AutocompleteRoutes = NectarRoutes extends { autocomplete: infer A }
  ? A
  : Record<string, string>;

/** Command paths that have an `autocomplete.ts`. */
export type AutocompletePath = keyof AutocompleteRoutes & string;

type AutocompleteContext<P extends AutocompletePath> = Omit<
  CommandContext<P & CommandPath>,
  "interaction"
> & { interaction: AutocompleteInteraction };

type ComponentArgs<P extends ComponentPath, I> =
  Empty extends ComponentParams<P>
    ? [params?: ComponentParams<P>, interaction?: StubFields<I>]
    : [params: ComponentParams<P>, interaction?: StubFields<I>];

type SelectInteraction<P extends ComponentPath> = Extract<
  ComponentContext<P>["interaction"],
  AnySelectMenuInteraction
>;

type ResponseMethod =
  | "reply"
  | "deferReply"
  | "editReply"
  | "followUp"
  | "deleteReply"
  | "update"
  | "deferUpdate"
  | "showModal"
  | "respond";

export interface TestResponse {
  method: ResponseMethod;
  /** The first argument the handler passed. */
  options: unknown;
}

/**
 * The signal that ended dispatch: `interaction:complete` (with `handled: false` when a
 * middleware stopped the chain), `interaction:fail` (with the error and the boundary that took
 * it), or `interaction:reject` (refused before any application code ran).
 */
export type Outcome = Extract<
  Signal,
  { type: "interaction:complete" | "interaction:fail" | "interaction:reject" }
>;

export interface InteractionResult<I> {
  /** The stub that was dispatched. */
  interaction: I;
  /** What the route sent back through the interaction, in call order. */
  responses: TestResponse[];
  outcome: Outcome;
  /** Every signal the dispatch emitted, `interaction:start` through the outcome. */
  signals: Signal[];
}

export interface EventResult {
  /** One per handler that threw, naming the boundary that took the error. */
  failures: Extract<Signal, { type: "event:fail" }>[];
}

export interface TestAppOptions {
  /** Handlers see it as `ctx.client`. Defaults to a discord.js client that never logs in. */
  client?: Client;
  /** Defaults to `"test"`. */
  env?: Env;
  /** Receives dispatch warnings and the default error boundary's output. Defaults to the console. */
  logger?: Logger;
  /** What handlers find on `ctx.services`, in place of plugin `start` hooks. */
  services?: Partial<NectarServices>;
}

/**
 * Runs routes from a built manifest through the runtime's own dispatch, without a gateway.
 * The interaction methods build a stubbed discord.js interaction for the route and resolve
 * once the middleware chain, handler, and error boundaries are done.
 */
export interface TestApp {
  readonly client: Client;
  /**
   * Runs a chat input or context menu command. `options` are values by name; the handler
   * reads them through discord.js's own option resolver.
   */
  command<P extends CommandPath>(
    path: P,
    options?: CommandOptions<P>,
    interaction?: StubFields<CommandContext<P>["interaction"]>,
  ): Promise<InteractionResult<CommandContext<P>["interaction"]>>;
  /**
   * Runs the autocomplete handler for `focused`, whose value is `options[focused]` or `""`.
   * As in a real autocomplete, user, channel, role, and attachment options arrive as IDs only.
   */
  autocomplete<P extends AutocompletePath>(
    path: P,
    focused: AutocompleteRoutes[P] & string,
    options?: CommandOptions<P & CommandPath>,
    interaction?: StubFields<AutocompleteInteraction>,
  ): Promise<InteractionResult<AutocompleteContext<P>["interaction"]>>;
  /** Clicks a button. The custom ID is encoded from `params`, then decoded and validated. */
  button<P extends ComponentPath>(
    path: P,
    ...args: ComponentArgs<P, ButtonInteraction>
  ): Promise<InteractionResult<ButtonInteraction>>;
  /** Submits a select menu. `values` starts empty; set it, or `users` and the like, on the stub. */
  select<P extends ComponentPath>(
    path: P,
    ...args: ComponentArgs<P, SelectInteraction<P>>
  ): Promise<InteractionResult<SelectInteraction<P>>>;
  /** Submits a modal. Set `fields` on the stub when the handler reads inputs. */
  modal<P extends ComponentPath>(
    path: P,
    ...args: ComponentArgs<P, ModalSubmitInteraction>
  ): Promise<InteractionResult<ModalSubmitInteraction>>;
  /**
   * Emits a discord.js event to its routes, in manifest order and mode, and resolves once they
   * finish. A `once` handler runs on the first call only, as it would in the runtime.
   */
  event<N extends keyof ClientEvents>(name: N, ...args: ClientEvents[N]): Promise<EventResult>;
}

/** `manifestFile` is a `.nectar/manifest.json` written by `nectar build` or `nectar dev`. */
export function createTestApp(manifestFile: string | URL, options: TestAppOptions = {}): TestApp {
  const { manifest, appDir } = loadManifest(
    manifestFile instanceof URL ? fileURLToPath(manifestFile) : manifestFile,
  );
  const client = options.client ?? new Client({ intents: [] });
  const logger = options.logger ?? createLogger();
  const signals = createSignals(logger);
  const state: RuntimeState = {
    manifest,
    appDir,
    client,
    modules: new ModuleRegistry(),
    env: options.env ?? "test",
    logger,
    signals,
    services: (options.services ?? {}) as NectarServices,
  };
  registerComponentRoutes(manifest.routes.filter(isComponentRoute));
  const dispatch = createInteractionDispatcher(state);
  const events = bindEvents(state);

  async function invoke<I>({ interaction, responses }: Stub): Promise<InteractionResult<I>> {
    const seen: Signal[] = [];
    const off = signals.on((signal) => {
      if ("trace" in signal && signal.trace === interaction.id) seen.push(signal);
    });
    try {
      await dispatch(interaction as unknown as Interaction);
    } finally {
      off();
    }
    const outcome = seen.at(-1);
    if (outcome === undefined || !isOutcome(outcome)) {
      throw new Error(`Dispatch of ${interaction.id} ended without an outcome signal.`);
    }
    return { interaction: interaction as I, responses, outcome, signals: seen };
  }

  function component(
    kind: ManifestComponentRoute["kind"],
    path: string,
    params: ComponentParams<ComponentPath> = {},
    fields?: object,
  ): Stub {
    const route = manifest.routes.find(
      (r): r is ManifestComponentRoute => r.kind === kind && r.path === path,
    );
    if (route === undefined) throw missing(kind, path);
    const customId = customIdFor(route, params);
    const base = { customId, replied: false, deferred: false };
    if (route.kind === "modal") {
      return stub(client, { ...base, type: InteractionType.ModalSubmit }, MODAL, fields);
    }
    const componentType =
      route.selectKind === null ? ComponentType.Button : SELECT_TYPES[route.selectKind];
    const values = route.kind === "select" ? { values: [] } : {};
    return stub(
      client,
      { ...base, ...values, type: InteractionType.MessageComponent, componentType },
      COMPONENT,
      fields,
    );
  }

  return {
    client,

    async command(path, values = {}, fields) {
      const { command, position } = findCommand(manifest, path);
      return invoke(
        stub(
          client,
          {
            type: InteractionType.ApplicationCommand,
            commandType: command.type,
            commandName: command.name,
            options: resolver(client, optionTree(command, position, values)),
            replied: false,
            deferred: false,
          },
          COMMAND,
          fields,
        ),
      );
    },

    async autocomplete(path, focused, values = {}, fields) {
      const route = manifest.routes.find((r) => r.kind === "autocomplete" && r.path === path);
      if (route?.kind !== "autocomplete") throw missing("autocomplete", path);
      if (!route.options.includes(focused)) {
        throw new Error(
          `Route ${route.id} has no autocomplete handler for "${focused}". It handles: ${route.options.join(", ")}.`,
        );
      }
      const { command, position } = findCommand(manifest, path);
      return invoke(
        stub(
          client,
          {
            type: InteractionType.ApplicationCommandAutocomplete,
            commandType: ApplicationCommandType.ChatInput,
            commandName: command.name,
            options: resolver(client, optionTree(command, position, values, focused)),
            responded: false,
          },
          AUTOCOMPLETE,
          fields,
        ),
      );
    },

    async button(path, ...args) {
      return invoke(component("button", path, args[0], args[1]));
    },

    async select(path, ...args) {
      return invoke(component("select", path, args[0], args[1]));
    },

    async modal(path, ...args) {
      return invoke(component("modal", path, args[0], args[1]));
    },

    async event(name, ...args) {
      const binding = events.find((b) => b.name === name);
      if (binding === undefined) throw missing("event", name);
      const failures: EventResult["failures"] = [];
      const off = signals.on((signal) => {
        if (signal.type === "event:fail" && signal.event === name) failures.push(signal);
      });
      try {
        await binding.listener(...args);
      } finally {
        off();
      }
      return { failures };
    },
  };
}

interface Stub {
  interaction: Record<string, unknown> & { id: string };
  responses: TestResponse[];
}

const REPLIES: ResponseMethod[] = ["reply", "deferReply", "editReply", "followUp", "deleteReply"];
const COMMAND: ResponseMethod[] = [...REPLIES, "showModal"];
const COMPONENT: ResponseMethod[] = [...REPLIES, "update", "deferUpdate", "showModal"];
const MODAL: ResponseMethod[] = [...REPLIES, "update", "deferUpdate"];
const AUTOCOMPLETE: ResponseMethod[] = ["respond"];

/** The flag discord.js sets when each response goes through. */
const FLAGS: Partial<Record<ResponseMethod, "replied" | "deferred" | "responded">> = {
  reply: "replied",
  update: "replied",
  showModal: "replied",
  deferReply: "deferred",
  deferUpdate: "deferred",
  respond: "responded",
};

/**
 * A plain object on discord.js's `BaseInteraction` prototype, so `isButton()`, `inGuild()`,
 * `inCachedGuild()`, and the other guards are discord.js's own checks against these fields.
 * Response methods record the call and set the flag discord.js would. Nothing reaches Discord.
 */
function stub(
  client: Client,
  fields: Record<string, unknown>,
  methods: readonly ResponseMethod[],
  overrides: object = {},
): Stub {
  const responses: TestResponse[] = [];
  const interaction: Stub["interaction"] = Object.create(BaseInteraction.prototype);
  const own: Record<string, unknown> = {
    client,
    id: SnowflakeUtil.generate().toString(),
    guildId: null,
    channelId: null,
    member: null,
    ...fields,
  };
  for (const method of methods) {
    own[method] = async (options?: unknown) => {
      responses.push({ method, options });
      const flag = FLAGS[method];
      if (flag !== undefined) interaction[flag] = true;
    };
  }
  // Defined rather than assigned: `guild` and `channel` are getters on the prototype.
  Object.defineProperties(interaction, Object.getOwnPropertyDescriptors({ ...own, ...overrides }));
  return { interaction, responses };
}

function findCommand(
  manifest: Manifest,
  path: string,
): { command: ManifestCommand; position: string } {
  const id = `command:${path}`;
  for (const command of manifest.commands) {
    for (const [position, route] of Object.entries(command.handlers)) {
      if (route === id) return { command, position };
    }
  }
  throw missing("command", path);
}

/**
 * The options Discord would send for `values`, nested under the subcommand and group at
 * `position`. Each option's type comes from the registration payload. With `focused` this is
 * an autocomplete payload: user, channel, role, and attachment options carry only their ID.
 */
function optionTree(
  command: ManifestCommand,
  position: string,
  values: Record<string, unknown>,
  focused?: string,
): object[] {
  const [group, sub] = position.includes("/") ? position.split("/") : [undefined, position];
  let schema: readonly SchemaOption[] =
    "options" in command.payload ? (command.payload.options ?? []) : [];
  for (const name of [group, sub]) {
    if (name) schema = schema.find((o) => o.name === name)?.options ?? [];
  }

  const route = command.handlers[position] ?? command.name;
  const entries = Object.entries(values);
  if (focused !== undefined && !(focused in values)) entries.push([focused, ""]);
  let tree: object[] = entries.map(([name, value]) => {
    const built = option(schema, name, value, route, focused === undefined);
    return name === focused ? { ...built, focused: true } : built;
  });
  if (sub) tree = [{ name: sub, type: ApplicationCommandOptionType.Subcommand, options: tree }];
  if (group) {
    tree = [{ name: group, type: ApplicationCommandOptionType.SubcommandGroup, options: tree }];
  }
  return tree;
}

/** The part of a registration payload option this module reads. */
interface SchemaOption {
  name: string;
  type: ApplicationCommandOptionType;
  options?: readonly SchemaOption[] | undefined;
}

/** Where discord.js keeps the resolved object for option types that have one. */
const RESOLVED: Partial<Record<ApplicationCommandOptionType, string>> = {
  [ApplicationCommandOptionType.User]: "user",
  [ApplicationCommandOptionType.Channel]: "channel",
  [ApplicationCommandOptionType.Role]: "role",
  [ApplicationCommandOptionType.Mentionable]: "user",
  [ApplicationCommandOptionType.Attachment]: "attachment",
};

function option(
  schema: readonly SchemaOption[],
  name: string,
  value: unknown,
  route: string,
  resolve: boolean,
): object {
  const found = schema.find((o) => o.name === name);
  if (found === undefined) {
    const known = schema.map((o) => o.name);
    throw new TypeError(
      `Route ${route} has no option "${name}". ${known.length === 0 ? "It takes none." : `It takes: ${known.join(", ")}.`}`,
    );
  }
  const resolved = RESOLVED[found.type];
  if (resolved === undefined) return { name, type: found.type, value };
  const id = typeof value === "object" && value !== null && "id" in value ? value.id : undefined;
  return resolve
    ? { name, type: found.type, value: id, [resolved]: value }
    : { name, type: found.type, value: id };
}

/** discord.js marks the constructor private; it is the same resolver real interactions carry. */
const Resolver = CommandInteractionOptionResolver as unknown as new (
  client: Client,
  options: readonly object[],
) => CommandInteractionOptionResolver;

function resolver(client: Client, options: readonly object[]): CommandInteractionOptionResolver {
  return new Resolver(client, options);
}

const SELECT_TYPES: Record<SelectKind, ComponentType> = {
  string: ComponentType.StringSelect,
  user: ComponentType.UserSelect,
  role: ComponentType.RoleSelect,
  channel: ComponentType.ChannelSelect,
  mentionable: ComponentType.MentionableSelect,
};

function isComponentRoute(route: Manifest["routes"][number]): route is ManifestComponentRoute {
  return route.kind === "button" || route.kind === "select" || route.kind === "modal";
}

const OUTCOMES: ReadonlySet<string> = new Set([
  "interaction:complete",
  "interaction:fail",
  "interaction:reject",
]);

function isOutcome(signal: Signal): signal is Outcome {
  return OUTCOMES.has(signal.type);
}

function missing(kind: string, path: string): Error {
  return new Error(
    `No ${kind} route "${path}" in the manifest. Run \`nectar build\` if you just added it.`,
  );
}
