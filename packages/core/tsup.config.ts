import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
  ...baseConfig,
  external: [
    ...commonExternals,
    "@anush008/tokenizers", "tokenizers"
  ]
});
