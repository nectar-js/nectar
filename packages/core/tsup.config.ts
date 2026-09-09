import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
    cli: "src/cli.ts",
  },
  format: "esm",
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
