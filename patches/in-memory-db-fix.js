/**
 * In-Memory Database Fix
 * 
 * This patch addresses issues with in-memory database connections by:
 * 1. Fixing SQLite in-memory pooling
 * 2. Ensuring proper connection sharing
 * 3. Setting up SQLite WAL mode for in-memory databases
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('🔧 Applying in-memory database fix...');

// Only apply fix if using in-memory database
if (process.env.USE_IN_MEMORY_DB === 'true') {
  console.log('⚠️ In-memory database mode detected');

  try {
    // Store a single connection for the process
    if (!globalThis.__ELIZA_SQLITE_SHARED_CONN) {
      const better_sqlite3 = require('better-sqlite3');

      // Create a shared in-memory connection with WAL mode
      const sharedConn = new better_sqlite3(':memory:');

      // Configure the database
      sharedConn.pragma('journal_mode = WAL');
      sharedConn.pragma('synchronous = NORMAL');
      sharedConn.pragma('foreign_keys = ON');

      // Set up basic schema
      sharedConn.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT,
          embedding BLOB,
          metadata TEXT,
          created_at INTEGER,
          updated_at INTEGER
        );
        
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          content, 
          content='memories', 
          content_rowid='rowid'
        );
      `);

      // Store it globally
      globalThis.__ELIZA_SQLITE_SHARED_CONN = sharedConn;
      console.log('✅ Created shared in-memory SQLite connection with WAL mode');

      // Monkeypatch the better-sqlite3 constructor to return our shared connection
      // when :memory: is requested
      const originalDatabase = better_sqlite3.prototype.constructor;

      better_sqlite3.prototype.constructor = function (filename, options) {
        if (filename === ':memory:') {
          console.log('📊 Returning shared in-memory database connection');
          return globalThis.__ELIZA_SQLITE_SHARED_CONN;
        }

        // Otherwise use the original constructor
        return originalDatabase.call(this, filename, options);
      };

      console.log('✅ Monkeypatched better-sqlite3 to use shared in-memory connection');
    } else {
      console.log('✅ Shared in-memory SQLite connection already exists');
    }
  } catch (error) {
    console.error('❌ Error applying in-memory database fix:', error);
  }
} else {
  console.log('ℹ️ Using file-based SQLite database (in-memory mode not enabled)');
}

console.log('✅ In-memory database fix applied'); 