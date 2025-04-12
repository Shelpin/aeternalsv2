import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    external: [
        ...commonExternals,
        // Client-direct specific externals
        "express", "cors", "ws",
        /^@elizaos\/core/
    ]
}); 