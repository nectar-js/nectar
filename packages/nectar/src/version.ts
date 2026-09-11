import { createRequire } from "node:module";

/** From package.json, which sits one level up from both `src/` and `dist/`. */
export const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
