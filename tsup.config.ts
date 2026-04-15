import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      cli: "src/cli.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    target: "node20",
    platform: "node",
    sourcemap: true,
    shims: true,
  },
]);
