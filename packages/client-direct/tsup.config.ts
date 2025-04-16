import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/public-api.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node18",
}); 