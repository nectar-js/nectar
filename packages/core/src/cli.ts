#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { run, setColors } from "./cli/index.js";

const envFile = path.join(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const wantsColor = process.env.NO_COLOR === undefined || process.env.NO_COLOR === "";
setColors(process.env.FORCE_COLOR !== undefined || (wantsColor && process.stdout.isTTY === true));

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
