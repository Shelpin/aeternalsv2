/**
 * Apply Patches
 * 
 * This script loads and applies all the necessary patches for the ElizaOS runtime.
 * It's designed to be run before starting the agent to ensure all patches are applied.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Applying all ElizaOS runtime patches...');

// Load patches in the correct order
async function applyPatches() {
  try {
    // 1. Apply SQLite path fix first
    console.log('🔧 Applying SQLite path fix...');
    await import('./sqlite-path-fix.js');

    // 2. Initialize the database
    console.log('🔧 Initializing database...');
    // Convert init_db.cjs to ESM compatible import
    const { execSync } = await import('child_process');
    console.log('Running init_db.cjs via child process');
    execSync('node patches/init_db.cjs', { stdio: 'inherit' });

    // 3. Apply in-memory database fix
    console.log('🔧 Applying in-memory database fix...');
    await import('./in-memory-db-fix.js');

    // 4. Apply relay configuration fixes
    console.log('🔧 Applying relay configuration fixes...');
    await import('./relay-config-fix.js');

    // 5. Load Telegram client statically
    console.log('🔧 Loading Telegram client statically...');
    // Convert telegram-client-static.js to ESM compatible import
    execSync('node -e "global.globalThis = global; require(\'./patches/telegram-client-static.js\')"', { stdio: 'inherit' });

    // 6. Apply runtime patch (module)
    console.log('🔧 Applying runtime patch...');
    const { runtime } = await import('./runtime-patch.js');

    // Make runtime globally available
    globalThis.__elizaRuntime = runtime;
    console.log('✅ Runtime patch applied and made globally available');

    // Register runtime actions
    if (runtime && typeof runtime.handleMessage === 'function') {
      if (runtime.registerAction) {
        runtime.registerAction({
          name: "handleMessage",
          description: "Message handler",
          handler: runtime.handleMessage.bind(runtime),
          validate: () => true,
          examples: []
        });
        console.log('✅ Registered handleMessage as a formal runtime action');
      }
    }

    // Apply relay fixes (depends on runtime)
    console.log('🔧 Applying relay fixes...');
    await import('./relay-fixes.js');
    console.log('✅ Relay fixes applied');

    console.log('✅ All patches applied successfully');
  } catch (error) {
    console.error('❌ Error applying patches:', error);
    throw error;
  }
}

// Run the patches
await applyPatches();
