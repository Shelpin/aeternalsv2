/**
 * This file serves as a proxy to the ElizaOS SQLite adapter.
 * It avoids direct imports of @elizaos/adapter-sqlite which might
 * not be available in all environments.
 */

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
  private betterSqlite3: any;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.betterSqlite3 = this.requireBetterSqlite3();
    this.db = new this.betterSqlite3(dbPath);
  }

  private requireBetterSqlite3() {
    try {
      // Dynamic import to avoid bundling issues
      return require('better-sqlite3');
    } catch (error) {
      console.error('Failed to load better-sqlite3. SQLite functionality will not be available.');
      throw new Error('SQLite adapter requires better-sqlite3 package');
    }
  }
  
  async init() {
    // This would normally initialize tables, but we'll let the coordination adapter handle it
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.error('Error closing SQLite database:', error);
      }
    }
  }
} 