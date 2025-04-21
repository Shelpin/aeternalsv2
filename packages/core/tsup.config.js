import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.base.mjs';

export default defineConfig({
    ...baseConfig,
    entry: ['src/index.ts'],
    external: [
        ...baseConfig.external || [],
        'mock-aws-s3',
        'aws-sdk',
        'nock',
        '@mapbox/node-pre-gyp',
        'better-sqlite3'
    ]
}); 