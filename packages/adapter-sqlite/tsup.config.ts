import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    external: [
        ...commonExternals,
        "better-sqlite3", "sqlite3", "sqlite",
        "@elizaos/core"
    ]
}); 