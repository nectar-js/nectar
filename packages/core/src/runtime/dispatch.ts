import type { AutocompleteInteraction, Interaction } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import { type ComponentKind, createMatcher } from "../components/index.js";
import type {
  ManifestAutocompleteRoute,
  ManifestCommand,
  ManifestCommandRoute,
  ManifestComponentRoute,
  ManifestRoute,
} from "../manifest/schema.js";
import { handleError } from "./errors.js";
import { runChain } from "./middleware.js";
import { chains, type RuntimeState, routeInfo } from "./state.js";
import type { Handler, InteractionContext, Middleware } from "./types.js";

/** Routes one incoming interaction. Resolves to nothing; every error ends in a boundary. */
export type InteractionDispatcher = (interaction: Interaction) => Promise<void>;

export function createInteractionDispatcher(state: RuntimeState): InteractionDispatcher {
  const tables = buildTables(state.manifest.routes, state.manifest.commands);

  return async (interaction) => {
    const receivedAt = Date.now();

    if (interaction.isChatInputCommand()) {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(false);
      const key = [group, sub].filter((p) => p !== null).join("/");
      const route = tables.commands.get(
        commandKey(ApplicationCommandType.ChatInput, interaction.commandName, key),
      );
      if (route === undefined) {
        return unknown(state, `chat input command /${interaction.commandName} ${key}`.trim());
      }
      return run(state, route, interaction, {}, receivedAt);
    }

    if (interaction.isContextMenuCommand()) {
      const route = tables.commands.get(
        commandKey(interaction.commandType, interaction.commandName, ""),
      );
      if (route === undefined) {
        return unknown(state, `context menu command "${interaction.commandName}"`);
      }
      return run(state, route, interaction, {}, receivedAt);
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
        return unknown(state, `autocomplete for /${interaction.commandName} option "${option}"`);
      }
      return run(state, route, interaction, {}, receivedAt, option);
    }

    const component: [ComponentKind, string] | null = interaction.isButton()
      ? ["button", interaction.customId]
      : interaction.isAnySelectMenu()
        ? ["select", interaction.customId]
        : interaction.isModalSubmit()
          ? ["modal", interaction.customId]
          : null;
    if (component === null) return;

    const [kind, customId] = component;
    const match = tables.matcher.match(kind, customId);
    if (!match.ok) {
      if (match.reason !== "not-neat") {
        state.logger.warn(`Ignoring ${kind} with custom ID "${customId}": ${match.reason}.`);
      }
      return;
    }
    return run(state, match.route, interaction, match.params, receivedAt);
  };
}

async function run(
  state: RuntimeState,
  route: ManifestRoute,
  interaction: Interaction,
  params: Record<string, string | string[]>,
  receivedAt: number,
  autocompleteOption?: string,
): Promise<void> {
  const ctx: InteractionContext = {
    interaction,
    client: state.client,
    route: routeInfo(state, route),
    params,
    env: state.env,
    trace: {
      id: interaction.id,
      receivedAt,
      elapsed: () => Date.now() - interaction.createdTimestamp,
    },
  };
  const files = chains(state, route);

  try {
    const middleware = await Promise.all(
      files.middleware.map((file) => state.modules.loadDefault<Middleware>(file, "Middleware")),
    );
    const handler =
      autocompleteOption === undefined
        ? await state.modules.loadDefault<Handler>(ctx.route.file, "The handler")
        : await state.modules.loadNamed<Handler>(
            ctx.route.file,
            autocompleteOption,
            "The autocomplete handler",
          );
    await runChain(middleware, ctx, handler);
  } catch (error) {
    await handleError(error, ctx, files.errors, state.modules, state.logger);
    if (autocompleteOption !== undefined)
      await closeAutocomplete(interaction as AutocompleteInteraction);
  }
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

function unknown(state: RuntimeState, what: string): void {
  state.logger.warn(`No route for ${what}. Run \`neat sync\` if commands changed.`);
}

interface Tables {
  /** `${type}:${name}:${handlerKey}` to the handler route. */
  commands: Map<string, ManifestCommandRoute>;
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
  for (const command of commands) {
    for (const [key, id] of Object.entries(command.handlers)) {
      const route = commandRoutes.get(id);
      if (route !== undefined) table.set(commandKey(command.type, command.name, key), route);
    }
  }

  return { commands: table, autocomplete, matcher: createMatcher(components) };
}

function commandKey(type: number, name: string, handlerKey: string): string {
  return `${type}:${name}:${handlerKey}`;
}
