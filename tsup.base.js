// Root tsup.base.js
const commonExternals = [
    '@elizaos/core',
    '@elizaos/adapter-sqlite',
    '@elizaos/agent',
    '@elizaos/client-direct',
    '@elizaos/plugin-bootstrap',
    '@elizaos/telegram-client',
    '@elizaos/telegram-multiagent'
];

const baseConfig = {
    splitting: false,
    clean: true,
    format: ['esm', 'cjs'],
    dts: false, // We use tsc for .d.ts generation
    sourcemap: true,
    minify: false,
    keepNames: true,
    treeshake: true
};

module.exports = {
    baseConfig,
    commonExternals
}; 