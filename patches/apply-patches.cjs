/**
 * Apply Patches (CommonJS version)
 * 
 * This script loads and applies all the necessary patches for the ElizaOS runtime.
 * It's designed to be run before starting the agent to ensure all patches are applied.
 */

console.log('🔧 Applying all ElizaOS runtime patches...');

// Load patches in the correct order
async function applyPatches() {
    try {
        // 1. Apply SQLite path fix first
        console.log('🔧 Applying SQLite path fix...');
        require('./sqlite-path-fix.js');

        // 2. Initialize the database
        console.log('🔧 Initializing database...');
        require('./init_db.cjs');

        // 3. Apply in-memory database fix
        console.log('🔧 Applying in-memory database fix...');
        require('./in-memory-db-fix.js');

        // 4. Apply relay configuration fixes
        console.log('🔧 Applying relay configuration fixes...');
        require('./relay-config-fix.js');

        // 5. Load Telegram client statically
        console.log('🔧 Loading Telegram client statically...');
        require('./telegram-client-static.js');

        console.log('✅ All initial patches applied successfully');
    } catch (error) {
        console.error('❌ Error applying patches:', error);
        process.exit(1);
    }
}

// Run the patches
applyPatches(); 