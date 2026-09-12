import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
    // Its own entry because the plugin points Nectar at this file by path: the middleware the
    // compiler adds to every route has to be the instance `t()` reads from.
    middleware: "src/middleware.ts",
  },
  format: "esm",
  platform: "node",
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
});
