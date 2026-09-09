import { existsSync } from "node:fs";
import { type Client, Events } from "discord.js";
import { compileProject, relative, summary } from "../cli/compile.js";
import { CliError, type CliIo } from "../cli/io.js";
import { loadProject, type Project } from "../cli/project.js";
import { renderRoutes } from "../cli/routes.js";
import {
  APPLICATION_ID_VAR,
  describeScope,
  projectConfigName,
  registerCommands,
  requireEnv,
  TOKEN_VAR,
} from "../cli/sync.js";
import type { RouteGraph } from "../compiler/graph.js";
import { enableModuleReloading, invalidateModuleGraph } from "../compiler/load.js";
import { type Manifest, toManifest, writeManifest } from "../manifest/index.js";
import { registrationScopes } from "../registration/index.js";
import {
  createRuntime,
  HandlerLoadError,
  type Logger,
  manifestFiles,
  type Runtime,
} from "../runtime/index.js";
import { writeTypes } from "../typegen/index.js";
import { classifyPath, diffManifests } from "./classify.js";

export interface DevServerOptions {
  /** Print the full route tree and discord.js warnings. */
  verbose?: boolean;
}

export interface DevServer {
  /** Compiles, registers dev guild commands, and starts the bot. Waits for a fix if the app does not compile. */
  start(): Promise<void>;
  /** Reacts to a batch of changed paths: reload handlers, rebuild routes, re-register, or restart. */
  apply(files: string[]): Promise<void>;
  stop(): Promise<void>;
}

/**
 * The state behind `nect dev`: the compiled manifest and the runtime serving it. Changes are
 * handled in the smallest way that keeps the running bot correct, and the gateway connection
 * survives everything but a config change.
 */
export function createDevServer(
  project: Project,
  io: CliIo,
  options: DevServerOptions = {},
): DevServer {
  const verbose = options.verbose ?? false;
  let current = project;
  let manifest: Manifest | null = null;
  let runtime: Runtime | null = null;
  let token = "";
  const warned = new Set<string>();

  const logger: Logger = {
    error(message, error) {
      io.err(message);
      if (error !== undefined) {
        io.err(error instanceof Error ? (error.stack ?? error.message) : String(error));
      }
    },
    warn: (message) => io.err(message),
  };

  function warnOnce(message: string): void {
    if (warned.has(message)) return;
    warned.add(message);
    io.err(message);
  }

  function emit(graph: RouteGraph): Manifest {
    const next = toManifest(graph, current.outDir);
    writeManifest(next, current.outDir);
    writeTypes(graph, current.outDir);
    return next;
  }

  async function register(graph: RouteGraph): Promise<void> {
    if (registrationScopes(current.config, current.env).length === 0) {
      warnOnce(`Commands are not registered: add dev.guilds to ${projectConfigName(current)}.`);
      return;
    }
    if (!io.env[APPLICATION_ID_VAR]) {
      warnOnce(`Commands are not registered: ${APPLICATION_ID_VAR} is not set.`);
      return;
    }
    try {
      const result = await registerCommands(current, graph, io);
      for (const scope of result.scopes) {
        if (scope.diff !== null || verbose) io.out(describeScope(scope));
      }
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      io.err(
        error.message.replace("Pass force to do it anyway.", "Run nect sync --force to do it."),
      );
    }
  }

  async function launch(): Promise<void> {
    if (manifest === null) return;
    const next = createRuntime({
      manifest,
      appDir: current.appDir,
      config: current.config,
      env: current.env,
      logger,
      ...(io.client === undefined ? {} : { client: io.client(current.config) }),
    });
    watchConnection(next.client);
    runtime = next;
    await next.start({ token, signals: false });
  }

  function watchConnection(client: Client): void {
    client.once(Events.ClientReady, (ready) => io.out(`Logged in as ${ready.user.tag}.`));
    client.on(Events.ShardDisconnect, (event) => {
      io.err(`Disconnected from the gateway (code ${event.code}).`);
    });
    client.on(Events.ShardReconnecting, () => io.out("Reconnecting to the gateway."));
    client.on(Events.ShardResume, () => io.out("Gateway connection resumed."));
    client.on(Events.Error, (error) => io.err(`Gateway error: ${error.message}`));
    if (verbose) client.on(Events.Warn, (message) => io.err(`discord.js: ${message}`));
  }

  /** Full start: compile, write output, print routes, register, run. */
  async function boot(): Promise<void> {
    const graph = await compileProject(current, io);
    if (graph === null) {
      io.err("Waiting for changes.");
      return;
    }
    manifest = emit(graph);
    io.out(verbose ? renderRoutes(graph, current.root) : `${summary(graph)} in ${appLabel()}.`);
    await register(graph);
    await launch();
  }

  async function stopRuntime(): Promise<void> {
    const running = runtime;
    runtime = null;
    manifest = null;
    if (running !== null) await running.stop();
  }

  async function restart(): Promise<void> {
    await stopRuntime();
    try {
      current = await loadProject(io.cwd, io.env);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      io.err(error.message);
      io.err("Waiting for changes.");
      return;
    }
    io.out(`Restarting with the new ${projectConfigName(current)}.`);
    await boot();
  }

  /** Imports files now so a broken module shows up here, not on the next interaction. */
  async function preload(files: string[]): Promise<void> {
    if (runtime === null) return;
    const results = await Promise.allSettled(files.map((file) => runtime?.modules.load(file)));
    for (const result of results) {
      if (result.status === "fulfilled") continue;
      const error: unknown = result.reason;
      io.err(
        error instanceof HandlerLoadError
          ? `${relative(current.root, error.file)}: ${error.detail}`
          : String(error),
      );
    }
  }

  function appLabel(): string {
    return `${relative(current.root, current.appDir) || "."}/`;
  }

  return {
    async start() {
      token = requireEnv(io, TOKEN_VAR);
      enableModuleReloading(current.root);
      await boot();
    },

    async apply(files) {
      const kinds = new Map(files.map((file) => [file, classifyPath(file, current)] as const));
      const changed = files.filter((file) => kinds.get(file) !== "ignored");
      if (changed.length === 0) return;
      for (const file of changed) {
        io.out(`${existsSync(file) ? "~" : "-"} ${relative(current.root, file)}`);
      }

      if (changed.some((file) => kinds.get(file) === "config")) {
        await restart();
        return;
      }
      const dependency = changed.some((file) => kinds.get(file) === "dependency");
      if (dependency) invalidateModuleGraph();

      if (runtime === null || manifest === null) {
        await boot();
        return;
      }

      const graph = await compileProject(current, io);
      if (graph === null) {
        io.err("Keeping the previous routes until this is fixed.");
        return;
      }
      const next = toManifest(graph, current.outDir);
      const delta = diffManifests(manifest, next);
      const done: string[] = [];
      if (delta.structure || delta.commands) manifest = emit(graph);
      if (delta.structure) {
        runtime.update(manifest);
        done.push(`routes rebuilt (${summary(graph)})`);
        if (verbose) io.out(renderRoutes(graph, current.root));
      }
      if (delta.commands) await register(graph);

      const all = manifestFiles(manifest, current.appDir);
      const stale = dependency ? [...all] : changed.filter((file) => all.has(file));
      runtime.modules.invalidate(dependency ? undefined : stale);
      await preload(stale);
      if (dependency) done.push("every module reloaded");
      else if (stale.length > 0) {
        done.push(`${stale.length} handler module${stale.length === 1 ? "" : "s"} reloaded`);
      }

      io.out(done.length === 0 ? "Nothing to reload." : `${capitalize(done.join(", "))}.`);
    },

    stop: stopRuntime,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
