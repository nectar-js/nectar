import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export type Language = "ts" | "js";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** What goes into `.env`. Anything left empty is filled in later. */
export interface Credentials {
  token?: string;
  applicationId?: string;
  guildId?: string;
}

export interface ScaffoldOptions {
  name: string;
  language: Language;
  packageManager: PackageManager;
  credentials?: Credentials;
}

export const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

export const PORTAL_URL = "https://discord.com/developers/applications";

/** The package manager that launched us, from `npm_config_user_agent`. npm when unknown. */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split("/")[0];
  return PACKAGE_MANAGERS.includes(name as PackageManager) ? (name as PackageManager) : "npm";
}

/** Why `dir` can't hold a new project, or `undefined` if it can. */
export function projectProblem(dir: string): string | undefined {
  const name = path.basename(path.resolve(dir));
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return `"${name}" isn't a valid package name. Use lowercase letters, digits, ".", "_", and "-".`;
  }
  if (existsSync(dir) && readdirSync(dir).length > 0) return `${dir} already has files in it.`;
  return undefined;
}

/** Why `value` isn't a Discord ID, or `undefined` if it is one or is empty. */
export function idProblem(value: string | undefined): string | undefined {
  if (value === undefined || value === "" || /^\d{17,20}$/.test(value)) return undefined;
  return "Discord IDs are 17 to 20 digits.";
}

type Style = (format: "cyan" | "dim", text: string) => string;

/** What's left to do after creating the project, one step per line. */
export function nextSteps(
  directory: string,
  { packageManager, credentials = {} }: ScaffoldOptions,
  installed: boolean,
  style: Style = (_format, text) => text,
): string {
  const run = packageManager === "npm" ? "npm run" : packageManager;
  const missing = [
    credentials.token ? null : "DISCORD_TOKEN",
    credentials.applicationId ? null : "DISCORD_APPLICATION_ID",
    credentials.guildId ? null : "DEV_GUILD_ID",
  ].filter((key): key is string => key !== null);
  return [
    directory === "." ? null : style("cyan", `cd ${directory}`),
    installed ? null : style("cyan", `${packageManager} install`),
    missing.length === 0 ? null : `Fill in ${missing.join(", ")} in .env`,
    style("cyan", `${run} dev`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const DISCORD_JS = "^14.27.0";

/** Everything a new project needs, as file paths relative to the project root. */
export function templateFiles(options: ScaffoldOptions): Record<string, string> {
  const ts = options.language === "ts";
  const ext = ts ? "ts" : "js";
  const { token = "", applicationId = "", guildId = "" } = options.credentials ?? {};
  const files: Record<string, string> = {
    "package.json": packageJson(options),
    [`nectar.config.${ext}`]: config(),
    ".env": `DISCORD_TOKEN=${token}\nDISCORD_APPLICATION_ID=${applicationId}\nDEV_GUILD_ID=${guildId}\n`,
    ".env.example": "DISCORD_TOKEN=\nDISCORD_APPLICATION_ID=\nDEV_GUILD_ID=\n",
    ".gitignore": "node_modules/\n.nectar/\n.env\n",
    [`app/middleware.${ext}`]: middleware(ts),
    [`app/commands/ping/command.${ext}`]: pingCommand(ts),
    [`app/components/counter/[count]/button.${ext}`]: counterButton(ts),
    [`app/events/clientReady/event.${ext}`]: readyEvent(),
  };
  if (ts) files["tsconfig.json"] = tsconfig();
  return files;
}

/** Writes the template into `dir`, which must not exist or be empty. Returns the written paths. */
export function scaffold(dir: string, options: ScaffoldOptions): string[] {
  const problem = projectProblem(dir);
  if (problem !== undefined) throw new Error(problem);
  const files = templateFiles(options);
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return Object.keys(files);
}

function packageJson({ name, language }: ScaffoldOptions): string {
  const scripts: Record<string, string> = {
    dev: "nectar dev",
    build: "nectar build",
    start: "nectar start",
    check: "nectar check",
    sync: "nectar sync",
  };
  if (language === "ts") scripts.typecheck = "nectar build && tsc --noEmit";
  const pkg = {
    name,
    private: true,
    type: "module",
    engines: { node: ">=22.18" },
    scripts,
    dependencies: { "@nectar-js/nectar": `^${version}`, "discord.js": DISCORD_JS },
    ...(language === "ts"
      ? { devDependencies: { "@types/node": "^22.20.1", typescript: "^5.9.0" } }
      : {}),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function config(): string {
  return `import { defineConfig } from "@nectar-js/nectar";

export default defineConfig({
  token: process.env.DISCORD_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  intents: ["Guilds"],
  dev: {
    // Commands register in your test server instantly while you develop.
    guilds: process.env.DEV_GUILD_ID ? [process.env.DEV_GUILD_ID] : [],
  },
});
`;
}

function tsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023"],
        types: ["node"],
        strict: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
      },
      include: ["app", "nectar.config.ts", ".nectar/types.d.ts"],
    },
    null,
    2,
  )}\n`;
}

function middleware(ts: boolean): string {
  return `import { defineMiddleware } from "@nectar-js/nectar";

// Runs before every interaction. Whatever you pass to next() is on ctx downstream${ts ? ", typed" : ""}.
export default defineMiddleware(async (_ctx, next) => {
  return next({ startedAt: Date.now() });
});
`;
}

function pingCommand(ts: boolean): string {
  const meta = ts
    ? `export const meta: CommandMeta = {`
    : `/** @type {import("@nectar-js/nectar").CommandMeta} */
export const meta = {`;
  const imports = ts
    ? `import { type CommandMeta, customId, defineCommand } from "@nectar-js/nectar";`
    : `import { customId, defineCommand } from "@nectar-js/nectar";`;
  return `${imports}
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

${meta}
  description: "Check that the bot is alive",
};

export default defineCommand("ping", async (ctx) => {
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: "0" }))
    .setLabel("Clicked 0 times")
    .setStyle(ButtonStyle.Primary);
  await ctx.interaction.reply({
    content: \`Pong in \${Date.now() - ctx.startedAt}ms\`,
    components: [new ActionRowBuilder${ts ? "<ButtonBuilder>" : ""}().addComponents(button)],
  });
});
`;
}

function counterButton(ts: boolean): string {
  return `import { customId, defineComponent } from "@nectar-js/nectar";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// The directory name [count] makes ctx.params.count a string decoded from the custom ID.
export default defineComponent("counter/[count]", async (ctx) => {
  const count = Number(ctx.params.count) + 1;
  const button = new ButtonBuilder()
    .setCustomId(customId("counter/[count]", { count: String(count) }))
    .setLabel(\`Clicked \${count} time\${count === 1 ? "" : "s"}\`)
    .setStyle(ButtonStyle.Primary);
  await ctx.interaction.update({
    components: [new ActionRowBuilder${ts ? "<ButtonBuilder>" : ""}().addComponents(button)],
  });
});
`;
}

function readyEvent(): string {
  return `import { defineEvent } from "@nectar-js/nectar";

export default defineEvent("clientReady", async (client) => {
  console.log(\`Logged in as \${client.user.tag}\`);
});
`;
}
