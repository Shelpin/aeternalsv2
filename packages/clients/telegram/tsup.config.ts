import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../../tsup.base");

export default defineConfig({
    ...baseConfig,
    external: [
        ...commonExternals,
        // Telegram client specific externals
        "node-telegram-bot-api",
        /^@elizaos\/core/
    ]
}); 