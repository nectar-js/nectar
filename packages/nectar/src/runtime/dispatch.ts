import type { AutocompleteInteraction, CommandInteraction, Interaction } from "discord.js";
import { ApplicationCommandType, MessageFlags } from "discord-api-types/v10";
import { type OptionSpec, optionsAt, resolveOptions } from "../commands/options.js";
import {
  type ComponentKind,
  createMatcher,
  findInvalidParam,
  type ParamValidators,
  paramValidatorsOf,
} from "../components/index.js";
import type {
  ManifestAutocompleteRoute,
  ManifestCommand,
  ManifestCommandRoute,
  ManifestComponentRoute,
  ManifestRoute,
} from "../manifest/schema.js";
import { handleError, logFields } from "./errors.js";
import { runMiddleware } from "./middleware.js";
import { HandlerLoadError } from "./modules.js";
import { runInScope, type Scope } from "./scope.js";
import { type InteractionMeta, interactionMeta } from "./signals.js";
import { chains, type RuntimeState, routeInfo } from "./state.js";
import type { Middleware, Options, Params } from "./types.js";

/** Routes one incoming interaction. Resolves to nothing; every error ends in a boundary. */
export type InteractionDispatcher = (interaction: Interaction) => Promise<void>;

export function createInteractionDispatcher(state: RuntimeState): InteractionDispatcher {
  const tables = buildTables(state.manifest.routes, state.manifest.commands);

  return async (interaction) => {
    const receivedAt = Date.now();
    const meta = interactionMeta(interaction);
    state.signals.emit({ type: "interaction:start", trace: interaction.id, interaction: meta });

    if (interaction.isChatInputCommand()) {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(false);
      const key = [group, sub].filter((p) => p !== null).join("/");
      const route = tables.commands.get(
        commandKey(ApplicationCommandType.ChatInput, interaction.commandName, key),
      );
      if (route === undefined) {
        return unknown(state, interaction, meta, `chat input command /${meta.command}`);
      }
      const options = resolveOptions(interaction, tables.options.get(route.id) ?? []);
      return run(state, route, interaction, meta, {}, receivedAt, options);
    }

    if (interaction.isContextMenuCommand()) {
      const route = tables.commands.get(
        commandKey(interaction.commandType, interaction.commandName, ""),
      );
      if (route === undefined) {
        return unknown(state, interaction, meta, `context menu command "${meta.command}"`);
      }
      return run(state, route, interaction, meta, {}, receivedAt);
    }

    if (interaction.isAutocomplete()) {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(false);
      const key = [group, sub].filter((p) => p !== null).join("/");
      const command = tables.commands.get(
        commandKey(ApplicationCommandType.ChatInput, interaction.commandName, key),
      );
      const route = command === undefined ? undefined : tables.autocomplete.get(command.id);
      const option = interaction.options.getFocused(true).name;
      if (route === undefined || !route.options.includes(option)) {
        return unknown(state, interaction, meta, `autocomplete for /${meta.command} "${option}"`);
      }
      return run(state, route, interaction, meta, {}, receivedAt, {}, option);
    }

    const component: [ComponentKind, string] | null = interaction.isButton()
      ? ["button", interaction.customId]
      : interaction.isAnySelectMenu()
        ? ["select", interaction.customId]
        : interaction.isModalSubmit()
          ? ["modal", interaction.customId]
          : null;
    if (component === null) {
      // Not a type Nectar routes. The app may listen for it on the client itself.
      state.signals.emit({
        type: "interaction:reject",
        trace: interaction.id,
        interaction: meta,
        reason: "unknown-interaction",
      });
      return;
    }

    const [kind, customId] = component;
    const match = tables.matcher.match(kind, customId);
    if (!match.ok) {
      if (match.reason === "not-nectar") return;
      state.logger.warn(`Ignoring ${kind} with custom ID "${meta.customId}": ${match.reason}.`, {
        trace: interaction.id,
        interaction: kind,
        customId: meta.customId,
      });
      state.signals.emit({
        type: "interaction:reject",
        trace: interaction.id,
        interaction: meta,
        reason: match.reason,
      });
      return;
    }
    return run(state, match.route, interaction, meta, match.params, receivedAt);
  };
}

async function run(
  state: RuntimeState,
  route: ManifestRoute,
  interaction: Interaction,
  meta: InteractionMeta,
  params: Params,
  receivedAt: number,
  options: Options = {},
  autocompleteOption?: string,
): Promise<void> {
  const scope: Scope = {
    interaction,
    client: state.client,
    env: state.env,
    services: state.services,
    route: routeInfo(state, route),
    trace: {
      id: interaction.id,
      receivedAt,
      elapsed: () => Date.now() - interaction.createdTimestamp,
    },
    results: new Map(),
  };
  const files = chains(state, route);
  const tag = { trace: interaction.id, interaction: meta, route: scope.route };
  state.signals.emit({ type: "route:match", ...tag });

  await runInScope(scope, async () => {
    let handlerStart = 0;
    try {
      const middleware = await Promise.all(
        files.middleware.map((file) => state.modules.loadDefault<Middleware>(file, "Middleware")),
      );
      const handler =
        autocompleteOption === undefined
          ? await state.modules.loadDefault<AnyHandler>(scope.route.file, "The handler")
          : await state.modules.loadNamed<AnyHandler>(
              scope.route.file,
              autocompleteOption,
              "The autocomplete handler",
            );
      if (route.kind === "button" || route.kind === "select" || route.kind === "modal") {
        const invalid = await findInvalidParam(
          validators(scope.route.file, handler, route),
          params,
        );
        if (invalid !== null) {
          state.logger.warn(
            `Rejected ${route.kind} for ${scope.route.id}: "${invalid}" failed validation.`,
            {
              ...logFields(scope, meta),
              param: invalid,
            },
          );
          state.signals.emit({
            type: "interaction:reject",
            trace: interaction.id,
            interaction: meta,
            reason: "invalid-param",
            route: scope.route,
            param: invalid,
          });
          return;
        }
      }
      const proceed = await runMiddleware(middleware, interaction, scope.results, (index) =>
        state.signals.emit({
          type: "middleware:enter",
          ...tag,
          file: files.middleware[index] ?? "",
        }),
      );
      if (proceed) {
        handlerStart = Date.now();
        state.signals.emit({ type: "handler:enter", ...tag });
        if (route.kind === "command") {
          if (route.defer !== null) await defer(interaction as CommandInteraction, route.defer);
          await handler(interaction, options);
        } else if (route.kind === "autocomplete") {
          await handler(interaction);
        } else {
          await handler(interaction, params);
        }
        state.signals.emit({
          type: "handler:complete",
          ...tag,
          duration: Date.now() - handlerStart,
        });
      }
      const handled = proceed;
      const duration = Date.now() - receivedAt;
      state.signals.emit({ type: "interaction:complete", ...tag, duration, handled });
      state.logger.debug(
        handled
          ? `Handled ${scope.route.id} in ${duration}ms.`
          : `Middleware stopped ${scope.route.id}.`,
        logFields(scope, meta),
      );
    } catch (error) {
      const boundary = await handleError(
        error,
        scope,
        files.errors,
        state.modules,
        state.logger,
        files.middleware,
      );
      state.signals.emit({ type: "interaction:fail", ...tag, error, boundary });
      if (boundary !== null) {
        state.logger.debug(`${scope.route.id} failed, handled by ${boundary}.`, {
          ...logFields(scope, meta),
          boundary,
          error,
        });
      }
      if (autocompleteOption !== undefined)
        await closeAutocomplete(interaction as AutocompleteInteraction);
    }
  });
}

/** A loaded handler of any kind. The route kind decides which arguments it gets. */
type AnyHandler = (...args: unknown[]) => unknown;

/**
 * Defers the reply right before the handler, after the middleware chain, so a policy check can
 * still answer with its own message. A middleware that already replied or deferred wins.
 */
async function defer(interaction: CommandInteraction, mode: "reply" | "ephemeral"): Promise<void> {
  if (interaction.replied || interaction.deferred) return;
  await interaction.deferReply(mode === "ephemeral" ? { flags: MessageFlags.Ephemeral } : {});
}

/** Discord shows a spinner until autocomplete answers, so a failed handler answers with nothing. */
async function closeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.responded) return;
  try {
    await interaction.respond([]);
  } catch {
    // Already answered or expired. Nothing left to do.
  }
}

function unknown(
  state: RuntimeState,
  interaction: Interaction,
  meta: InteractionMeta,
  what: string,
): void {
  state.logger.warn(`No route for ${what}. Run \`nectar sync\` if commands changed.`, {
    trace: interaction.id,
    interaction: meta.type,
    command: meta.command,
  });
  state.signals.emit({
    type: "interaction:reject",
    trace: interaction.id,
    interaction: meta,
    reason: "no-route",
  });
}

/**
 * The route's parameter validators, checked once per handler instance. The compiler checked
 * the shape at build time; this repeats it so a JavaScript project or a hot-reloaded file
 * fails the same way instead of at the first click.
 */
function validators(
  file: string,
  handler: AnyHandler,
  route: ManifestComponentRoute,
): ParamValidators {
  const cached = validatorCache.get(handler);
  if (cached !== undefined) return cached;
  let result: ParamValidators;
  try {
    result = paramValidatorsOf(handler, route);
  } catch (error) {
    throw new HandlerLoadError(file, error instanceof Error ? error.message : String(error));
  }
  validatorCache.set(handler, result);
  return result;
}

const validatorCache = new WeakMap<AnyHandler, ParamValidators>();

interface Tables {
  /** `${type}:${name}:${handlerKey}` to the handler route. */
  commands: Map<string, ManifestCommandRoute>;
  /** Command route ID to the options its handler declares, from the registration payload. */
  options: Map<string, OptionSpec[]>;
  autocomplete: Map<string, ManifestAutocompleteRoute>;
  matcher: ReturnType<typeof createMatcher<ManifestComponentRoute>>;
}

function buildTables(routes: ManifestRoute[], commands: ManifestCommand[]): Tables {
  const commandRoutes = new Map<string, ManifestCommandRoute>();
  const autocomplete = new Map<string, ManifestAutocompleteRoute>();
  const components: ManifestComponentRoute[] = [];

  for (const route of routes) {
    if (route.kind === "command") commandRoutes.set(route.id, route);
    else if (route.kind === "autocomplete") autocomplete.set(route.id, route);
    else if (route.kind !== "event") components.push(route);
  }

  const table = new Map<string, ManifestCommandRoute>();
  const options = new Map<string, OptionSpec[]>();
  for (const command of commands) {
    for (const [key, id] of Object.entries(command.handlers)) {
      const route = commandRoutes.get(id);
      if (route === undefined) continue;
      table.set(commandKey(command.type, command.name, key), route);
      options.set(id, optionsAt(command.payload, key));
    }
  }

  return { commands: table, options, autocomplete, matcher: createMatcher(components) };
}

function commandKey(type: number, name: string, handlerKey: string): string {
  return `${type}:${name}:${handlerKey}`;
}
