// tsup.config.cjs
module.exports = {
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  outDir: "dist",
  splitting: false,
  bundle: true,
  skipNodeModulesBundle: true,
  shims: true,
  minify: false,
}; 