import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    entry: ["src/index.ts"],
    external: [
        ...commonExternals,
        // Telegram-specific externals
        "node-telegram-bot-api", "ws",
        /^@elizaos\/core/,
        /^@elizaos\/agent/,
        /^@elizaos\/adapter-sqlite/
    ],
    // Ensure we don't bundle node_modules
    noExternal: []
}); 