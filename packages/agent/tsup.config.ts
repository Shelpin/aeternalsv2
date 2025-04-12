import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    external: [
        ...commonExternals,
        // Agent-specific externals
        "openai", "@vercel/ai",
        /^@elizaos\/core/,
        /^@elizaos\/plugin-bootstrap/
    ]
}); 