import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
    cli: "src/cli.ts",
  },
  format: "esm",
  platform: "node",
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
});
