import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export type Language = "ts" | "js";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ScaffoldOptions {
  name: string;
  language: Language;
  packageManager: PackageManager;
}

export const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/** The package manager that launched us, from `npm_config_user_agent`. npm when unknown. */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split("/")[0];
  return PACKAGE_MANAGERS.includes(name as PackageManager) ? (name as PackageManager) : "npm";
}

export function nextSteps(directory: string, { packageManager }: ScaffoldOptions): string {
  const run = packageManager === "npm" ? "npm run" : packageManager;
  return [
    "Next:",
    `  cd ${directory}`,
    `  ${packageManager} install`,
    "  cp .env.example .env    then fill in DISCORD_TOKEN and DISCORD_APPLICATION_ID",
    "  add your test server's ID to dev.guilds in the config",
    `  ${run} dev`,
    "",
    "Tokens and IDs live in the Developer Portal: https://discord.com/developers/applications",
  ].join("\n");
}

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const DISCORD_JS = "^14.27.0";

/** Everything a new project needs, as file paths relative to the project root. */
export function templateFiles(options: ScaffoldOptions): Record<string, string> {
  const ts = options.language === "ts";
  const ext = ts ? "ts" : "js";
  const files: Record<string, string> = {
    "package.json": packageJson(options),
    [`neat.config.${ext}`]: config(),
    ".env.example": "DISCORD_TOKEN=\nDISCORD_APPLICATION_ID=\n",
    ".gitignore": "node_modules/\n.neat/\n.env\n",
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
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`${dir} already exists and is not empty.`);
  }
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
    dev: "neat dev",
    build: "neat build",
    start: "neat start",
    check: "neat check",
    sync: "neat sync",
  };
  if (language === "ts") scripts.typecheck = "neat build && tsc --noEmit";
  const pkg = {
    name,
    private: true,
    type: "module",
    engines: { node: ">=22.18" },
    scripts,
    dependencies: { "@neatjs/core": `^${version}`, "discord.js": DISCORD_JS },
    ...(language === "ts"
      ? { devDependencies: { "@types/node": "^22.20.1", typescript: "^5.9.0" } }
      : {}),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function config(): string {
  return `import { defineConfig } from "@neatjs/core";

export default defineConfig({
  intents: ["Guilds"],
  dev: {
    // Commands register here instantly while you develop. Paste your test server's ID.
    guilds: [],
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
        skipLibCheck: true,
        verbatimModuleSyntax: true,
      },
      include: ["app", "neat.config.ts", ".neat/types.d.ts"],
    },
    null,
    2,
  )}\n`;
}

function middleware(ts: boolean): string {
  return `import { defineMiddleware } from "@neatjs/core";

// Runs before every interaction. Whatever you pass to next() is on ctx downstream${ts ? ", typed" : ""}.
export default defineMiddleware(async (_ctx, next) => {
  return next({ startedAt: Date.now() });
});
`;
}

function pingCommand(ts: boolean): string {
  const meta = ts
    ? `export const meta: CommandMeta = {`
    : `/** @type {import("@neatjs/core").CommandMeta} */
export const meta = {`;
  const imports = ts
    ? `import { type CommandMeta, customId, defineCommand } from "@neatjs/core";`
    : `import { customId, defineCommand } from "@neatjs/core";`;
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
  return `import { customId, defineComponent } from "@neatjs/core";
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
  return `import { defineEvent } from "@neatjs/core";

export default defineEvent("clientReady", async (client) => {
  console.log(\`Logged in as \${client.user.tag}\`);
});
`;
}
