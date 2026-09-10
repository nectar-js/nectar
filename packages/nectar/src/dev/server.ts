import { existsSync } from "node:fs";
import { type Client, Events } from "discord.js";
import { compileProject, relative, summary } from "../cli/compile.js";
import { CliError, type CliIo } from "../cli/io.js";
import { loadProject, type Project } from "../cli/project.js";
import { renderRoutes } from "../cli/routes.js";
import {
  APPLICATION_ID_VAR,
  credential,
  describeScope,
  findCredential,
  projectConfigName,
  registerCommands,
  registrationHint,
} from "../cli/sync.js";
import { block, c, credentialHint, fail, indent, info, ok, stamp, warn } from "../cli/ui.js";
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
 * The state behind `nectar dev`: the compiled manifest and the runtime serving it. Changes are
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
  let started = false;
  const warned = new Set<string>();

  /** Lines printed while the server is running carry a timestamp; startup lines do not. */
  const say = (line: string) => io.out(started ? `${stamp()} ${line}` : line);
  const complain = (line: string) => io.err(started ? `${stamp()} ${line}` : line);

  const logger: Logger = {
    error(message, error) {
      const [head = "", ...rest] = message.split("\n");
      const stack = error === undefined ? [] : describeError(error);
      complain(block(fail(c.bold(head)), [...rest.map((l) => l.trimStart()), ...stack]));
    },
    warn: (message) => complain(warn(message)),
  };

  function warnOnce(head: string, details: string[] = []): void {
    if (warned.has(head)) return;
    warned.add(head);
    complain(block(warn(head), details));
  }

  function emit(graph: RouteGraph): Manifest {
    const next = toManifest(graph, current.outDir);
    writeManifest(next, current.outDir);
    writeTypes(graph, current.outDir);
    return next;
  }

  async function register(graph: RouteGraph): Promise<void> {
    if (registrationScopes(current.config, current.env).length === 0) {
      warnOnce("Commands are not registered anywhere yet.", registrationHint(current));
      return;
    }
    if (findCredential(current, io, "applicationId") === null) {
      warnOnce(
        `Commands are not registered: ${APPLICATION_ID_VAR} is not set.`,
        credentialHint("applicationId", projectConfigName(current)),
      );
      return;
    }
    try {
      const result = await registerCommands(current, graph, io);
      for (const scope of result.scopes) {
        if (scope.diff !== null || verbose) say(describeScope(scope));
      }
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      complain(
        block(
          fail(error.message),
          error.details.map((line) => line.replace("run again with", "run nectar sync with")),
        ),
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
    client.once(Events.ClientReady, (ready) => say(ok(`Logged in as ${c.bold(ready.user.tag)}.`)));
    client.on(Events.ShardDisconnect, (event) => {
      complain(warn(`Disconnected from the gateway ${c.dim(`(code ${event.code})`)}.`));
    });
    client.on(Events.ShardReconnecting, () => say(info("Reconnecting to the gateway.")));
    client.on(Events.ShardResume, () => say(ok("Gateway connection resumed.")));
    client.on(Events.Error, (error) => complain(fail(`Gateway error: ${error.message}`)));
    if (verbose) client.on(Events.Warn, (message) => complain(warn(`discord.js: ${message}`)));
  }

  /** Full start: compile, write output, print routes, register, run. */
  async function boot(): Promise<void> {
    const graph = await compileProject(current, io);
    if (graph === null) {
      complain(warn("Waiting for changes."));
      return;
    }
    manifest = emit(graph);
    say(ok(`${summary(graph)} in ${c.bold(appLabel())}`));
    if (verbose)
      for (const line of indent(renderRoutes(graph, current.root).split("\n"))) say(line);
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
      complain(block(fail(error.message), error.details));
      complain(warn("Waiting for changes."));
      return;
    }
    say(info(`Restarting with the new ${c.bold(projectConfigName(current))}.`));
    await boot();
  }

  /** Imports files now so a broken module shows up here, not on the next interaction. */
  async function preload(files: string[]): Promise<void> {
    if (runtime === null) return;
    const results = await Promise.allSettled(files.map((file) => runtime?.modules.load(file)));
    for (const result of results) {
      if (result.status === "fulfilled") continue;
      const error: unknown = result.reason;
      complain(
        error instanceof HandlerLoadError
          ? block(fail(`${c.bold(relative(current.root, error.file))} failed to load.`), [
              error.detail,
            ])
          : fail(String(error)),
      );
    }
  }

  function appLabel(): string {
    return `${relative(current.root, current.appDir) || "."}/`;
  }

  return {
    async start() {
      token = credential(current, io, "token");
      enableModuleReloading(current.root);
      await boot();
      started = true;
    },

    async apply(files) {
      const kinds = new Map(files.map((file) => [file, classifyPath(file, current)] as const));
      const changed = files.filter((file) => kinds.get(file) !== "ignored");
      if (changed.length === 0) return;
      for (const file of changed) {
        const gone = !existsSync(file);
        say(`${gone ? c.red("-") : c.yellow("~")} ${relative(current.root, file)}`);
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
        complain(warn("Keeping the previous routes until this is fixed."));
        return;
      }
      const next = toManifest(graph, current.outDir);
      const delta = diffManifests(manifest, next);
      const done: string[] = [];
      if (delta.structure || delta.commands) manifest = emit(graph);
      if (delta.structure) {
        runtime.update(manifest);
        done.push(`routes rebuilt ${c.dim(`(${summary(graph)})`)}`);
        if (verbose) {
          for (const line of indent(renderRoutes(graph, current.root).split("\n"))) say(line);
        }
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

      say(done.length === 0 ? info("Nothing to reload.") : ok(`${capitalize(done.join(", "))}.`));
    },

    stop: stopRuntime,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeError(error: unknown): string[] {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return text.split("\n").map((line) => c.dim(line));
}
