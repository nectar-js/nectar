import path from "node:path";
import type { CompiledCommand } from "../commands/compile.js";
import { Diagnostics } from "../compiler/diagnostics.js";
import { loadModule } from "../compiler/load.js";
import type { Route, RouteTable } from "../compiler/routes.js";

export interface CompiledAutocomplete {
  /** The `autocomplete.ts` route. Shares its identity with the sibling `command.ts`. */
  route: Route;
  /** The command route these handlers serve. */
  command: Route;
  /** Option names with a handler, sorted. Each is a named export of the file. */
  options: string[];
}

export interface CompiledAutocompletes {
  autocomplete: CompiledAutocomplete[];
  diagnostics: Diagnostics;
}

/**
 * Links every `autocomplete.ts` to its sibling command and checks that each named export
 * matches an option declared with `autocomplete: true`, and that no such option is left
 * without a handler.
 */
export async function compileAutocomplete(
  table: RouteTable,
  commands: CompiledCommand[],
): Promise<CompiledAutocompletes> {
  const diagnostics = new Diagnostics();
  const routes = table.routes.filter((r) => r.kind === "autocomplete");

  const targets = new Map<string, { command: Route; options: Set<string> }>();
  for (const command of commands) {
    for (const [key, route] of Object.entries(command.handlers)) {
      targets.set(route.id, { command: route, options: autocompleteOptions(command, key) });
    }
  }

  const results = await Promise.all(
    routes.map(async (route): Promise<CompiledAutocomplete | null> => {
      const target = targets.get(route.id);
      if (target === undefined) {
        // A command.ts that failed to compile has its own diagnostic already.
        if (table.routes.some((r) => r.id === route.id && r.kind === "command")) return null;
        diagnostics.error(
          "autocomplete-without-command",
          "There's no command.ts next to this autocomplete.ts. Autocomplete answers the options of the command in the same directory, so move it next to that command.ts.",
          { file: route.file, route: route.id },
        );
        return null;
      }

      let module: Record<string, unknown>;
      try {
        module = await loadModule(route.file);
      } catch (error) {
        diagnostics.error(
          "module-load-failed",
          `The compiler imports every route file to read its exports, and this one threw: ${error instanceof Error ? error.message : String(error)}`,
          { file: route.file, route: route.id },
        );
        return null;
      }

      const exported = Object.keys(module)
        .filter((name) => name !== "default")
        .sort();
      let ok = true;

      for (const name of exported) {
        if (typeof module[name] !== "function") {
          diagnostics.error(
            "autocomplete-export-not-function",
            `Export "${name}" isn't a function. Each export of autocomplete.ts is a function that answers the option with the same name.`,
            { file: route.file, route: route.id },
          );
          ok = false;
          continue;
        }
        if (!target.options.has(name)) {
          diagnostics.error(
            "autocomplete-unknown-option",
            `Export "${name}" doesn't match an option with autocomplete: true in ${relative(target.command.file)}. ${expected(target.options)} Rename the export, or set autocomplete: true on the option.`,
            { file: route.file, route: route.id },
          );
          ok = false;
        }
      }

      for (const name of [...target.options].sort()) {
        if (exported.includes(name)) continue;
        diagnostics.error(
          "autocomplete-missing-handler",
          `Option "${name}" has autocomplete: true, but this file doesn't export a function named "${name}" to answer it.`,
          { file: route.file, route: route.id },
        );
        ok = false;
      }

      return ok ? { route, command: target.command, options: exported } : null;
    }),
  );

  for (const [id, target] of targets) {
    if (target.options.size === 0 || routes.some((r) => r.id === id)) continue;
    const names = [...target.options].map((o) => `"${o}"`);
    diagnostics.error(
      "autocomplete-missing-file",
      names.length === 1
        ? `Option ${names[0]} has autocomplete: true, but there's no autocomplete.ts next to this command. Add one that exports a function named ${names[0]}.`
        : `Options ${new Intl.ListFormat("en").format(names)} have autocomplete: true, but there's no autocomplete.ts next to this command. Add one that exports a function named after each of them.`,
      { file: target.command.file, route: id },
    );
  }

  return {
    autocomplete: results.filter((r): r is CompiledAutocomplete => r !== null),
    diagnostics,
  };
}

/** Names of the options with `autocomplete: true` for one handler position of a command. */
function autocompleteOptions(command: CompiledCommand, key: string): Set<string> {
  let options = (command.payload as PayloadNode).options;
  for (const part of key === "" ? [] : key.split("/")) {
    options = options?.find((o) => o.name === part)?.options;
  }
  return new Set(
    (options ?? []).filter((o) => o.autocomplete === true).map((o) => o.name as string),
  );
}

/** The parts of a registration payload the option walk needs. */
interface PayloadNode {
  name?: string;
  autocomplete?: boolean;
  options?: PayloadNode[];
}

function expected(options: Set<string>): string {
  const names = [...options].sort().map((o) => `"${o}"`);
  if (names.length === 0) return "That command has no autocomplete options.";
  return names.length === 1
    ? `Its autocomplete option is ${names[0]}.`
    : `Its autocomplete options are ${new Intl.ListFormat("en").format(names)}.`;
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}
