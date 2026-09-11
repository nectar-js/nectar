#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import * as p from "@clack/prompts";
import {
  type Credentials,
  detectPackageManager,
  idProblem,
  type Language,
  nextSteps,
  PACKAGE_MANAGERS,
  type PackageManager,
  PORTAL_URL,
  projectProblem,
  scaffold,
  version,
} from "./scaffold.js";

const DOCS_URL = "https://nectar-js.github.io/nectar/";

const USAGE = `Usage: npm create @nectar-js [directory] [options]

Options:
  --ts, --js                Language. Asked when omitted.
  --pm <name>               Package manager: npm, pnpm, yarn, or bun. Detected from the one running this.
  --install, --no-install   Install dependencies. Asked when omitted.
  --git, --no-git           Create a git repository. Asked when omitted.
  --yes, -y                 Use the defaults for anything not given, and skip the Discord details.
  --help, -h                Show this help.`;

/** The logo's honey behind dark text, where the terminal can show it. */
function badge(text: string): string {
  if (process.stdout.hasColors?.(2 ** 24)) {
    return `\x1b[48;2;245;165;36m\x1b[38;2;27;20;14m${text}\x1b[0m`;
  }
  return styleText(["bgYellow", "black"], text);
}

/** Ends the run when the person presses Ctrl+C or Escape at a prompt. */
function answer<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Nothing was created.");
    process.exit(1);
  }
  // isCancel narrows out clack's cancel symbol, but TypeScript can't carry that to a generic T.
  return value as T;
}

/** Runs a command in `cwd`, collecting its output for when it fails. The arguments are fixed. */
function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    // npm, pnpm, and yarn are .cmd scripts on Windows, which Node only starts through a shell.
    // A shell takes one command string; an argument array with `shell` is deprecated.
    const child =
      process.platform === "win32"
        ? spawn([command, ...args].join(" "), { cwd, shell: true })
        : spawn(command, args, { cwd });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output }));
  });
}

async function main(argv: string[]): Promise<number> {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        ts: { type: "boolean" },
        js: { type: "boolean" },
        pm: { type: "string" },
        install: { type: "boolean" },
        git: { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      allowNegative: true,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 2;
  }
  if (values.help === true) {
    console.log(USAGE);
    return 0;
  }
  if (values.ts === true && values.js === true) {
    console.error("Pass --ts or --js, not both.");
    return 2;
  }
  if (values.pm !== undefined && !PACKAGE_MANAGERS.includes(values.pm as PackageManager)) {
    console.error(`Unknown package manager "${values.pm}". Use ${PACKAGE_MANAGERS.join(", ")}.`);
    return 2;
  }

  const interactive = values.yes !== true && process.stdin.isTTY === true;
  p.intro(`${badge(" Nectar ")} ${styleText("dim", `v${version}`)}`);

  const directory =
    positionals[0] ??
    (interactive
      ? answer(
          await p.text({
            message: "Where should the project go?",
            placeholder: "my-bot",
            defaultValue: "my-bot",
            validate: (value) => projectProblem(value || "my-bot"),
          }),
        )
      : "my-bot");
  const problem = projectProblem(directory);
  if (problem !== undefined) {
    p.cancel(problem);
    return 2;
  }

  const language: Language =
    values.js === true
      ? "js"
      : values.ts === true || !interactive
        ? "ts"
        : answer(
            await p.select<Language>({
              message: "Language",
              options: [
                { value: "ts", label: "TypeScript" },
                { value: "js", label: "JavaScript" },
              ],
            }),
          );

  const detected = detectPackageManager(process.env.npm_config_user_agent);
  const packageManager =
    (values.pm as PackageManager | undefined) ??
    (interactive
      ? answer(
          await p.select<PackageManager>({
            message: "Package manager",
            options: PACKAGE_MANAGERS.map((pm) => ({
              value: pm,
              label: pm,
              ...(pm === detected ? { hint: "detected" } : {}),
            })),
            initialValue: detected,
          }),
        )
      : detected);

  const credentials: Credentials = {};
  if (interactive) {
    p.log.message(
      `Your bot's details from ${PORTAL_URL}\nPress Enter to skip any of them and fill them in later.`,
    );
    credentials.token = answer(await p.password({ message: "Bot token", mask: "•" }));
    credentials.applicationId = answer(
      await p.text({ message: "Application ID", validate: idProblem }),
    );
    credentials.guildId = answer(
      await p.text({
        message: "Test server ID",
        placeholder: "Commands register here instantly while you develop",
        validate: idProblem,
      }),
    );
  }

  const install =
    (values.install as boolean | undefined) ??
    (interactive
      ? answer(await p.confirm({ message: `Install dependencies with ${packageManager}?` }))
      : true);
  const git =
    (values.git as boolean | undefined) ??
    (interactive ? answer(await p.confirm({ message: "Create a git repository?" })) : true);

  const target = path.resolve(directory);
  const name = path.basename(target);
  const options = { name, language, packageManager, credentials };
  scaffold(target, options);
  p.log.success(`Created ${styleText("bold", name)}`);

  let installed = false;
  if (install) {
    // A spinner redraws in place; in a log it would print every frame.
    const spin = process.stdout.isTTY ? p.spinner() : null;
    const message = `Installing dependencies with ${packageManager}`;
    if (spin === null) p.log.step(message);
    else spin.start(message);
    const result = await run(packageManager, ["install"], target);
    installed = result.ok;
    const failure = `${packageManager} install failed:\n${result.output.trim()}`;
    if (spin === null) {
      if (result.ok) p.log.success("Installed dependencies");
      else p.log.error(failure);
    } else if (result.ok) spin.stop("Installed dependencies");
    else spin.error(failure);
  }

  if (git) {
    const result = await run("git", ["init", "--quiet"], target);
    if (result.ok) p.log.success("Created a git repository");
    else p.log.warn(`Couldn't create a git repository: ${result.output.trim()}`);
  }

  const style = (format: "cyan" | "dim", text: string) => styleText(format, text);
  p.note(nextSteps(directory, options, installed, style), "Next steps");
  p.outro(`Docs at ${styleText("underline", DOCS_URL)}`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
