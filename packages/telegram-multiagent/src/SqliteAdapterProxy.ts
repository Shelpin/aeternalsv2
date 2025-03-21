/**
 * This file serves as a proxy to the ElizaOS SQLite adapter.
 * It avoids direct imports of @elizaos/adapter-sqlite which might
 * not be available in all environments.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';

// Define the database interface that we need
export interface SqliteDatabase {
  prepare(sql: string): any;
  exec(sql: string): void;
  close(): void;
}

/**
 * SQLite Database Adapter for ElizaOS
 * This implementation is based on better-sqlite3
 */
export class SqliteDatabaseAdapter {
  private db: SqliteDatabase | null = null;
  private ready: boolean = false;
  private initializationError: Error | null = null;
  private initializationPromise: Promise<void> | null = null;
  private retries: number = 0;
  private maxRetries: number = 3;
  
  /**
   * Create a new SQLite adapter
   * @param dbPathOrInstance Either a path to the database file or an existing Database instance
   */
  constructor(dbPathOrInstance: string | SqliteDatabase) {
    console.log('[SQLITE] SqliteDatabaseAdapter: Initializing');
    
    // If we got a Database instance directly, use it
    if (typeof dbPathOrInstance !== 'string') {
      console.log('[SQLITE] SqliteDatabaseAdapter: Using provided database instance');
      this.db = dbPathOrInstance;
      this.ready = true;
      return;
    }
    
    // Initialize asynchronously to avoid blocking the main thread
    this.initializationPromise = this.initializeAsync(dbPathOrInstance);
  }
  
  /**
   * Initialize the database asynchronously
   * @param dbPath Path to the database file
   */
  private async initializeAsync(dbPath: string): Promise<void> {
    try {
      console.log(`[SQLITE] SqliteDatabaseAdapter: Initializing database at ${dbPath}`);
      
      // Create the database connection
      this.db = new BetterSqlite3(dbPath);
      console.log('[SQLITE] SqliteDatabaseAdapter: Database created successfully');
      
      // Initialize database schema
      this.initializeSchema();
      
      // Mark as ready
      this.ready = true;
      console.log('[SQLITE] SqliteDatabaseAdapter: Database initialized and ready');
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      console.error(`[SQLITE] SqliteDatabaseAdapter: Initialization failed: ${this.initializationError.message}`);
      
      // Retry initialization if we haven't exceeded max retries
      if (this.retries < this.maxRetries) {
        this.retries++;
        console.log(`[SQLITE] SqliteDatabaseAdapter: Retrying initialization (attempt ${this.retries}/${this.maxRetries})`);
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try again
        return this.initializeAsync(dbPath);
      }
      
      // If we've exceeded max retries, throw the error
      throw this.initializationError;
    }
  }
  
  /**
   * Initialize the database schema
   */
  private initializeSchema(): void {
    if (!this.db) {
      console.error('[SQLITE] SqliteDatabaseAdapter: Cannot initialize schema, database not available');
      return;
    }
    
    try {
      // Create tables if they don't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id TEXT NOT NULL,
          topic TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          sender_id TEXT NOT NULL,
          content TEXT NOT NULL,
          sent_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_seen INTEGER NOT NULL
        );
      `);
      
      console.log('[SQLITE] SqliteDatabaseAdapter: Schema initialized successfully');
    } catch (error) {
      console.error(`[SQLITE] SqliteDatabaseAdapter: Schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw, let the adapter continue functioning if possible
    }
  }
  
  /**
   * Ensure the database is ready before executing operations
   * @throws Error if database is not initialized
   */
  private async ensureReady(): Promise<void> {
    // If already ready, return immediately
    if (this.ready && this.db) {
      return;
    }
    
    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }
    
    // If we have an initialization error, throw it
    if (this.initializationError) {
      throw this.initializationError;
    }
    
    // If we get here, something went wrong
    throw new Error('SQLite adapter is not initialized and no initialization is in progress');
  }
  
  /**
   * Execute a SQL statement
   * @param sql SQL statement to execute
   * @param params Parameters for the statement
   * @returns Result of the execution
   */
  async execute(sql: string, params: any[] = []): Promise<any> {
    await this.ensureReady();
    
    if (!this.db) {
      throw new Error('SQLite database is not initialized');
    }
    
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    } catch (error) {
      console.error(`[SQLITE] SqliteDatabaseAdapter: Error executing SQL: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Query the database
   * @param sql SQL query
   * @param params Parameters for the query
   * @returns Query results
   */
  async query(sql: string, params: any[] = []): Promise<any[]> {
    await this.ensureReady();
    
    if (!this.db) {
      throw new Error('SQLite database is not initialized');
    }
    
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      console.error(`[SQLITE] SqliteDatabaseAdapter: Error querying database: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get a single row from the database
   * @param sql SQL query
   * @param params Parameters for the query
   * @returns Single row or null if not found
   */
  async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    await this.ensureReady();
    
    if (!this.db) {
      throw new Error('SQLite database is not initialized');
    }
    
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params) || null;
    } catch (error) {
      console.error(`[SQLITE] SqliteDatabaseAdapter: Error querying single row: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
        console.log('[SQLITE] SqliteDatabaseAdapter: Database closed');
      } catch (error) {
        console.error(`[SQLITE] SqliteDatabaseAdapter: Error closing database: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.db = null;
        this.ready = false;
      }
    }
  }
  
  /**
   * Check if the database is ready
   */
  isReady(): boolean {
    return this.ready && this.db !== null;
  }
} 