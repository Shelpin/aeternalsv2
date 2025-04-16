import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
  ...baseConfig,
  entry: ["src/**/*.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  external: [
    ...commonExternals,
    "js-sha1",
    "@fal-ai/client",
    "fastembed",
    "js-tiktoken",
    "openai",
    "sql.js",
    "together-ai"
  ],
  noExternal: [],
  esbuildOptions(options) {
    options.format = "esm";
    options.platform = "node";
    options.logLevel = "error";
  }
});
