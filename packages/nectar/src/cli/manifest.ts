import {
  type Manifest,
  type ManifestRoute,
  stableStringify,
  toManifest,
} from "../manifest/index.js";
import { compileProject } from "./compile.js";
import { CliError, type CliIo, EXIT_FAILURE, EXIT_OK } from "./io.js";
import { loadProject } from "./project.js";

/** `nectar manifest [--route <id>]`: print the compiled manifest, or everything about one route. */
export async function manifest(io: CliIo, route: string | undefined): Promise<number> {
  const project = await loadProject(io.cwd, io.env);
  const graph = await compileProject(project, io);
  if (graph === null) return EXIT_FAILURE;
  const compiled = toManifest(graph, project.outDir);

  if (route === undefined) {
    io.out(stableStringify(compiled));
    return EXIT_OK;
  }
  const matches = compiled.routes.filter((r) => r.id === route || r.path === route);
  if (matches.length === 0) {
    const known = [...new Set(compiled.routes.map((r) => r.id))].sort();
    throw new CliError(`No route "${route}".`, {
      details: ["Known routes:", ...known.map((id) => `  ${id}`)],
    });
  }
  io.out(stableStringify(matches.map((r) => describeRoute(r, compiled))));
  return EXIT_OK;
}

/** The route record plus what the manifest links it to: its command payload, custom ID, or event. */
export function describeRoute(route: ManifestRoute, compiled: Manifest): Record<string, unknown> {
  const detail: Record<string, unknown> = { ...route };
  if (route.kind === "command" || route.kind === "autocomplete") {
    for (const command of compiled.commands) {
      const position = Object.entries(command.handlers).find(([, id]) => id === route.id)?.[0];
      if (position === undefined) continue;
      detail.command = { name: command.name, position, payload: command.payload };
      if (route.kind === "autocomplete") {
        detail.commandRoute = compiled.routes.find(
          (r) => r.kind === "command" && r.id === route.id,
        )?.file;
      }
    }
  } else if (route.kind === "event") {
    const event = compiled.events.find((e) => e.name === route.event);
    if (event !== undefined) detail.eventHandlers = { mode: event.mode, handlers: event.handlers };
  } else {
    detail.customId = [
      `n:${route.shortId}`,
      ...route.params.map((p) => (p === route.catchAll ? `<...${p}>` : `<${p}>`)),
    ].join(":");
  }
  return detail;
}
