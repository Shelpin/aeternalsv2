import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
  ...baseConfig,
  dts: false,
  entry: ["src/index.ts", "src/public-api.ts", "src/utils/**/*.ts"],
  external: [
    ...commonExternals,
    "@anush008/tokenizers", "tokenizers"
  ]
});
