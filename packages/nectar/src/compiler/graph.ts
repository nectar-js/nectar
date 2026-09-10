import path from "node:path";
import { type CompiledAutocomplete, compileAutocomplete } from "../autocomplete/compile.js";
import { type CompiledCommand, compileCommands } from "../commands/compile.js";
import { type ComponentRoute, compileComponents } from "../components/compile.js";
import { type CompiledEvent, compileEvents } from "../events/compile.js";
import { type RouteChains, resolveChains } from "./chains.js";
import { Diagnostics } from "./diagnostics.js";
import { type Boundary, buildRouteTable, type Route } from "./routes.js";

/**
 * Everything the compiler knows about an app, after every category has been validated.
 * The manifest is a serialization of this.
 */
export interface RouteGraph {
  /** Absolute path of the app directory. */
  appDir: string;
  /** Every handler route, in discovery order. */
  routes: Route[];
  boundaries: Boundary[];
  /** Middleware and error chains keyed by the route's handler file. */
  chains: Map<string, RouteChains>;
  commands: CompiledCommand[];
  components: ComponentRoute[];
  events: CompiledEvent[];
  autocomplete: CompiledAutocomplete[];
  /** Plugin names that changed a route's chains, keyed by handler file. Filled by `applyPlugins`. */
  plugins: Map<string, string[]>;
  /** Diagnostics from every stage, in pipeline order. */
  diagnostics: Diagnostics;
}

/** Runs the whole compiler pipeline on an app directory. */
export async function buildGraph(appDir: string): Promise<RouteGraph> {
  const absolute = path.resolve(appDir);
  const table = buildRouteTable(absolute);
  const diagnostics = new Diagnostics();
  diagnostics.items.push(...table.diagnostics.items);

  const [commands, components, events] = await Promise.all([
    compileCommands(table),
    compileComponents(table),
    compileEvents(table),
  ]);
  const autocomplete = await compileAutocomplete(table, commands.commands);

  for (const stage of [commands, components, events, autocomplete]) {
    diagnostics.items.push(...stage.diagnostics.items);
  }

  const chains = new Map<string, RouteChains>();
  for (const route of table.routes) chains.set(route.file, resolveChains(route, table.boundaries));

  return {
    appDir: absolute,
    routes: table.routes,
    boundaries: table.boundaries,
    chains,
    commands: commands.commands,
    components: components.routes,
    events: events.events,
    autocomplete: autocomplete.autocomplete,
    plugins: new Map(),
    diagnostics,
  };
}
