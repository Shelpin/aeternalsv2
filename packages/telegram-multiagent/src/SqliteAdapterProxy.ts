/**
 * This file serves as a proxy to the ElizaOS SQLite adapter.
 * It avoids direct imports of @elizaos/adapter-sqlite which might
 * not be available in all environments.
 */

// Import better-sqlite3 directly - we've ensured it's in our dependencies
import BetterSqlite3 from 'better-sqlite3';

// Define basic types for compatibility
export interface Database {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: any[]) => any;
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
  };
  close: () => void;
}

// Define a minimal compatible adapter
export class SqliteDatabaseAdapter {
  public db: Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    console.log(`[SQLITE] Initializing database at path: ${dbPath}`);
    
    try {
      // Create a new database instance
      this.db = new BetterSqlite3(dbPath);
      console.log('[SQLITE] Successfully created SQLite database');
    } catch (error) {
      console.error('[SQLITE] Failed to create SQLite database:', error);
      throw new Error(`Failed to create SQLite database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async init() {
    // This would normally initialize tables, but we'll let the coordination adapter handle it
    console.log('[SQLITE] Adapter initialized');
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
        console.log('[SQLITE] Database closed successfully');
      } catch (error) {
        console.error('[SQLITE] Error closing SQLite database:', error);
      }
    }
  }
  
  // Helper methods for working with the database
  
  async createTable(tableName: string, schema: string) {
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`);
      console.log(`[SQLITE] Created table: ${tableName}`);
      return true;
    } catch (error) {
      console.error(`[SQLITE] Error creating table ${tableName}:`, error);
      return false;
    }
  }
  
  prepare(sql: string) {
    return this.db.prepare(sql);
  }
  
  exec(sql: string) {
    return this.db.exec(sql);
  }
} 