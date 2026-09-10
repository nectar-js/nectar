import type { Interaction } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import type { Logger, RouteInfo } from "./types.js";

/** Structured, non-sensitive description of an interaction for logs and signals. */
export interface InteractionMeta {
  type:
    | "chatInput"
    | "userContextMenu"
    | "messageContextMenu"
    | "autocomplete"
    | "button"
    | "select"
    | "modal"
    | "unknown";
  /** Full command name with subcommand group and subcommand, for commands and autocomplete. */
  command?: string;
  /** Custom ID with Nectar param values replaced by `*`. */
  customId?: string;
  guildId: string | null;
  channelId: string | null;
  userId: string | null;
}

export interface RegistrationScopeResult {
  scope: string;
  /** A bulk overwrite was sent. */
  applied: boolean;
}

/** Everything the runtime reports about itself, without the timestamp. */
export type SignalData =
  | { type: "interaction:start"; trace: string; interaction: InteractionMeta }
  | { type: "route:match"; trace: string; interaction: InteractionMeta; route: RouteInfo }
  | {
      type: "middleware:enter";
      trace: string;
      interaction: InteractionMeta;
      route: RouteInfo;
      file: string;
    }
  | { type: "handler:enter"; trace: string; interaction: InteractionMeta; route: RouteInfo }
  | {
      type: "handler:complete";
      trace: string;
      interaction: InteractionMeta;
      route: RouteInfo;
      /** Milliseconds the handler took. */
      duration: number;
    }
  | {
      type: "interaction:complete";
      trace: string;
      interaction: InteractionMeta;
      route: RouteInfo;
      /** Milliseconds since the runtime received the interaction. */
      duration: number;
      /** `false` when a middleware stopped the chain before the handler. */
      handled: boolean;
    }
  | {
      type: "interaction:fail";
      trace: string;
      interaction: InteractionMeta;
      route: RouteInfo;
      error: unknown;
      /** The `error.ts` that handled it, or `null` for the default boundary. */
      boundary: string | null;
    }
  | { type: "event:fail"; event: string; route: RouteInfo; error: unknown; boundary: string | null }
  | { type: "registration:start"; scopes: string[] }
  | { type: "registration:complete"; scopes: RegistrationScopeResult[]; duration: number }
  | { type: "gateway:connect"; shard: number; resumed: boolean }
  | { type: "gateway:disconnect"; shard: number; code: number }
  | { type: "shutdown" };

export type SignalType = SignalData["type"];

export type Signal = SignalData & {
  /** Epoch milliseconds. */
  at: number;
};

export type SignalListener = (signal: Signal) => void;

export interface SignalEmitter {
  /** Delivers every signal to `listener`. Returns a function that unsubscribes. */
  on(listener: SignalListener): () => void;
  emit(data: SignalData): void;
}

/**
 * Fan-out for framework signals. Listeners run synchronously in subscription order; one that
 * throws is reported through the logger and does not affect the others or the interaction.
 */
export function createSignals(logger: Pick<Logger, "error">): SignalEmitter {
  const listeners = new Set<SignalListener>();
  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(data) {
      if (listeners.size === 0) return;
      const signal: Signal = { ...data, at: Date.now() };
      for (const listener of listeners) {
        try {
          listener(signal);
        } catch (error) {
          logger.error(`A signal listener threw on ${data.type}.`, { error });
        }
      }
    },
  };
}

/** Reads the fields spec 31 asks for off a discord.js interaction, tolerating stubs. */
export function interactionMeta(interaction: Interaction): InteractionMeta {
  const i = interaction as unknown as InteractionLike;
  const guard = (name: GuardName) => typeof i[name] === "function" && i[name]?.() === true;
  const where = {
    guildId: i.guildId ?? null,
    channelId: i.channelId ?? null,
    userId: i.user?.id ?? null,
  };
  if (guard("isChatInputCommand") || guard("isAutocomplete")) {
    return {
      type: guard("isAutocomplete") ? "autocomplete" : "chatInput",
      command: [
        i.commandName,
        i.options?.getSubcommandGroup(false) ?? null,
        i.options?.getSubcommand(false) ?? null,
      ]
        .filter((p): p is string => typeof p === "string")
        .join(" "),
      ...where,
    };
  }
  if (guard("isContextMenuCommand")) {
    return {
      type:
        i.commandType === ApplicationCommandType.Message ? "messageContextMenu" : "userContextMenu",
      command: i.commandName ?? "",
      ...where,
    };
  }
  const kind = guard("isButton")
    ? "button"
    : guard("isAnySelectMenu")
      ? "select"
      : guard("isModalSubmit")
        ? "modal"
        : null;
  if (kind !== null) return { type: kind, customId: redactCustomId(i.customId ?? ""), ...where };
  return { type: "unknown", ...where };
}

/**
 * Keeps the route part of a Nectar custom ID and hides the parameter values, which may carry
 * anything the application put there. Other custom IDs are not ours and pass through.
 */
export function redactCustomId(customId: string): string {
  if (!customId.startsWith("n:")) return customId;
  const params = customId.indexOf(":", 2);
  return params === -1 ? customId : `${customId.slice(0, params)}:*`;
}

type GuardName =
  | "isChatInputCommand"
  | "isAutocomplete"
  | "isContextMenuCommand"
  | "isButton"
  | "isAnySelectMenu"
  | "isModalSubmit";

interface InteractionLike extends Partial<Record<GuardName, () => boolean>> {
  commandName?: string;
  commandType?: number;
  customId?: string;
  guildId?: string | null;
  channelId?: string | null;
  user?: { id: string };
  options?: {
    getSubcommandGroup(required: false): string | null;
    getSubcommand(required: false): string | null;
  };
}
