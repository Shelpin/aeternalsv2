import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    // Commented out to prevent tsup from conflicting with tsc on type emission
    // dts: {
    //     entry: "src/public-api.ts"
    // },
    outDir: "dist",
    sourcemap: true,
    clean: true,
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    bundle: true,
    splitting: true, // Add this for better code splitting
    external: [
        "fs", "path", "http", "https",
        "dotenv", "onnxruntime-node", "sharp"
    ],
});
