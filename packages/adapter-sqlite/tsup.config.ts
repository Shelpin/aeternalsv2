import { defineConfig } from "tsup";
const { baseConfig, commonExternals } = require("../../tsup.base");

export default defineConfig({
    ...baseConfig,
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node18",
    external: [
        ...commonExternals,
        "better-sqlite3",
        "sqlite-vec"
    ],
    noExternal: [],
    esbuildOptions(options) {
        options.format = "esm"
        options.platform = "node"
    }
}); 