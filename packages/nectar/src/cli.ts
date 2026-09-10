#!/usr/bin/env node
import { main } from "./cli/index.js";

process.exitCode = await main(process.argv.slice(2), process.cwd());
