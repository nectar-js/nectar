import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  dts: false,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
});
