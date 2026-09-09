import { styleText } from "node:util";

/**
 * Terminal formatting for the CLI and dev server. Colors are off until the bin turns them on
 * for a TTY, so tests and piped output see plain text with the same glyphs.
 */
let colors = false;

export function setColors(enabled: boolean): void {
  colors = enabled;
}

type Style = Parameters<typeof styleText>[0];

const paint =
  (style: Style) =>
  (text: string): string =>
    colors ? styleText(style, text) : text;

export const c = {
  bold: paint("bold"),
  dim: paint("dim"),
  red: paint("red"),
  green: paint("green"),
  yellow: paint("yellow"),
  cyan: paint("cyan"),
  magenta: paint("magenta"),
  underline: paint("underline"),
};

export const ok = (text: string): string => `${c.green("✔")} ${text}`;
export const fail = (text: string): string => `${c.red("✖")} ${text}`;
export const warn = (text: string): string => `${c.yellow("▲")} ${text}`;
export const info = (text: string): string => `${c.cyan("›")} ${text}`;
export const link = (url: string): string => c.underline(c.cyan(url));

export const PORTAL_URL = "https://discord.com/developers/applications";

export function indent(lines: readonly string[], by = 2): string[] {
  return lines.map((line) => (line === "" ? "" : `${" ".repeat(by)}${line}`));
}

/** A headline followed by indented detail lines, as one multi-line string. */
export function block(head: string, details: readonly string[] = []): string {
  return details.length === 0 ? head : [head, "", ...indent(details)].join("\n");
}

/** Two-column rows with dim keys, aligned on the widest key. */
export function table(rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(0, ...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${c.dim(key.padEnd(width))}  ${value}`);
}

/** `HH:MM:SS`, dimmed. Prefix for dev server lines that happen while it runs. */
export function stamp(): string {
  return c.dim(new Date().toTimeString().slice(0, 8));
}

/** The env var hints, shared by every command that needs credentials. */
export function credentialHint(name: string): string[] {
  const where =
    name === "DISCORD_TOKEN"
      ? "your application → Bot → Reset Token"
      : "your application → General Information → Application ID";
  return [
    `Nect reads it from ${c.bold(".env")} in the project root, or from the environment.`,
    `Get it from the Developer Portal under ${where}:`,
    link(PORTAL_URL),
  ];
}
