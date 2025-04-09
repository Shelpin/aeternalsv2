import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/public-api.ts"],
    // DTS generation is handled by tsc using tsconfig.build.json
    // Do not enable DTS in tsup to avoid conflicts
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
