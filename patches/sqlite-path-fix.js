/**
 * SQLite Path Fix
 * 
 * This script patches the AgentRuntime to use a specific SQLite database path
 */

console.log('[SQLITE-FIX] Setting explicit SQLite database path');

/**
 * Patch function to set explicit SQLite database path
 * @param {string} dbPath The path to the SQLite database
 * @returns {string} The patched database path
 */
export function patchSqlitePath(dbPath = '/root/eliza/data/db.sqlite') {
  // Set environment variable for the database path
  process.env.SQLITE_DATABASE_PATH = dbPath;
  console.log(`[SQLITE-FIX] Using database path: ${dbPath}`);
  
  // In ES modules we can't monkey patch require, so we rely on the environment variable
  // being picked up by the database adapter
  
  return dbPath;
}

// Apply the patch immediately
const patchedPath = patchSqlitePath();

// Export the patched database path
export default patchedPath; 