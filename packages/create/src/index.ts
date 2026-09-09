#!/usr/bin/env node
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  detectPackageManager,
  type Language,
  nextSteps,
  PACKAGE_MANAGERS,
  type PackageManager,
  type ScaffoldOptions,
  scaffold,
} from "./scaffold.js";

const USAGE = `Usage: npm create @neatjs [directory] [options]

Options:
  --ts, --js        Language. Asked when omitted.
  --pm <name>       Package manager: npm, pnpm, yarn, or bun. Detected from the one running this.
  --yes, -y         Take the defaults instead of asking.
  --help, -h        Show this help.`;

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
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
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
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (question: string, fallback: string): Promise<string> => {
    if (rl === null) return fallback;
    const answer = (await rl.question(`${question} (${fallback}) `)).trim();
    return answer === "" ? fallback : answer;
  };

  try {
    const directory = positionals[0] ?? (await ask("Project directory:", "my-bot"));
    const name = path.basename(path.resolve(directory));
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
      console.error(
        `"${name}" is not a valid package name. Use lowercase letters, digits, ".", "_", and "-".`,
      );
      return 2;
    }

    let language: Language = values.js === true ? "js" : "ts";
    if (values.ts !== true && values.js !== true) {
      const answer = await ask("TypeScript or JavaScript? [ts/js]", "ts");
      if (answer !== "ts" && answer !== "js") {
        console.error(`Answer ts or js, not "${answer}".`);
        return 2;
      }
      language = answer;
    }

    const detected = detectPackageManager(process.env.npm_config_user_agent);
    let packageManager = (values.pm as PackageManager | undefined) ?? detected;
    if (values.pm === undefined) {
      const answer = await ask(`Package manager? [${PACKAGE_MANAGERS.join("/")}]`, detected);
      if (!PACKAGE_MANAGERS.includes(answer as PackageManager)) {
        console.error(`Unknown package manager "${answer}".`);
        return 2;
      }
      packageManager = answer as PackageManager;
    }

    const options: ScaffoldOptions = { name, language, packageManager };
    const target = path.resolve(directory);
    let files: string[];
    try {
      files = scaffold(target, options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    console.log(`\nCreated ${name} with ${files.length} files.\n`);
    console.log(nextSteps(directory, options));
    return 0;
  } finally {
    rl?.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
