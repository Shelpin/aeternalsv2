import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    dts: false,
    external: [
        ...commonExternals,
        // Plugin-bootstrap specific externals
        /^@elizaos\/core/
    ]
}); 