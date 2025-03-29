/**
 * This file serves as a proxy to the ElizaOS SQLite adapter.
 * It avoids direct imports of @elizaos/adapter-sqlite which might
 * not be available in all environments.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { elizaLogger } from '@elizaos/core';

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
      console.log('[SQLITE] SqliteDatabaseAdapter: Initializing database schema...');
      
      // Enable WAL mode for better performance
      this.db.exec(`PRAGMA journal_mode = WAL;`);
      this.db.exec(`PRAGMA synchronous = NORMAL;`);
      this.db.exec(`PRAGMA temp_store = MEMORY;`);
      this.db.exec(`PRAGMA mmap_size = 30000000;`);
      
      console.log('[SQLITE] SqliteDatabaseAdapter: Applied performance optimizations');
      
      // ElizaOS required tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          user_id TEXT,
          timestamp INTEGER NOT NULL,
          content TEXT NOT NULL,
          vector BLOB,
          metadata TEXT
        );
        
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT
        );
        
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id TEXT NOT NULL,
          topic TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_seen INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      
      // Create indexes for faster queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id);
        CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
        CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON conversations(group_id);
      `);
      
      // Verify tables were created
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all();
      console.log(`[SQLITE] SqliteDatabaseAdapter: Initialized ${tables.length} tables: ${tables.map(t => t.name).join(', ')}`);
      
      console.log('[SQLITE] SqliteDatabaseAdapter: Schema initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[SQLITE] SqliteDatabaseAdapter: Schema initialization failed: ${errorMsg}`);
      console.error(`[SQLITE] Full error: ${JSON.stringify(error)}`);
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

/**
 * SQLite Adapter Proxy
 * 
 * A wrapper around the SQLite adapter with enhanced error handling, retry logic,
 * and health detection to improve resilience and provide better diagnostic information.
 */
export class SqliteAdapterProxy {
  private adapter: any;
  private adapterName: string;
  private healthyConnection: boolean = true;
  private lastError: Error | null = null;
  private consecutiveErrors: number = 0;
  private circuitBreakerOpen: boolean = false;
  
  constructor(adapter: any, adapterName: string = 'unknown') {
    this.adapter = adapter;
    this.adapterName = adapterName;
    
    // Log initialization
    elizaLogger.info(`[SQLITE_PROXY] Initializing SQLite adapter proxy for ${adapterName}`, '', '');
    
    // Initial health check
    this.checkHealth();
  }
  
  /**
   * Perform a health check on the SQLite adapter
   * @returns True if the adapter is healthy, false otherwise
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.adapter) {
        elizaLogger.warn(`[SQLITE_PROXY] No adapter available for ${this.adapterName}`, '', '');
        this.healthyConnection = false;
        return false;
      }
      
      // Try a simple query to check connectivity
      elizaLogger.debug(`[SQLITE_PROXY] Performing health check on ${this.adapterName}`, '', '');
      
      // Use testSqliteConnection if available (for FallbackMemoryManager)
      if (typeof this.adapter.testSqliteConnection === 'function') {
        const result = await this.adapter.testSqliteConnection();
        this.healthyConnection = result;
        
        if (result) {
          elizaLogger.info(`[SQLITE_PROXY] Health check for ${this.adapterName} passed`, '', '');
          this.resetCircuitBreaker();
        } else {
          elizaLogger.error(`[SQLITE_PROXY] Health check for ${this.adapterName} failed`, '', '');
        }
        
        return result;
      }
      
      // Otherwise try checking with query if the method exists
      if (typeof this.adapter.query === 'function') {
        await this.adapter.query('SELECT 1');
        this.healthyConnection = true;
        this.resetCircuitBreaker();
        elizaLogger.info(`[SQLITE_PROXY] Health check for ${this.adapterName} passed`, '', '');
        return true;
      }
      
      // If we can't check health, assume it's healthy but log a warning
      elizaLogger.warn(`[SQLITE_PROXY] Cannot check health of ${this.adapterName} adapter (no suitable method)`, '', '');
      this.healthyConnection = true;
      return true;
    } catch (error) {
      this.lastError = error;
      this.healthyConnection = false;
      elizaLogger.error(`[SQLITE_PROXY] Health check for ${this.adapterName} failed: ${error.message}`, '', '');
      elizaLogger.error(`[SQLITE_PROXY] Error details: ${JSON.stringify(error)}`, '', '');
      
      if (error.stack) {
        elizaLogger.error(`[SQLITE_PROXY] Stack trace: ${error.stack}`, '', '');
      }
      
      return false;
    }
  }
  
  /**
   * Reset the circuit breaker state
   */
  private resetCircuitBreaker(): void {
    if (this.circuitBreakerOpen) {
      elizaLogger.info(`[SQLITE_PROXY] Resetting circuit breaker for ${this.adapterName}`, '', '');
    }
    
    this.circuitBreakerOpen = false;
    this.consecutiveErrors = 0;
  }
  
  /**
   * Check if the circuit breaker should be opened (stop trying to use SQLite)
   * @param error The error that triggered this check
   * @returns True if the circuit breaker is now open
   */
  private shouldOpenCircuitBreaker(error: Error): boolean {
    this.consecutiveErrors++;
    
    // Open circuit breaker after 3 consecutive errors
    if (this.consecutiveErrors >= 3) {
      this.circuitBreakerOpen = true;
      elizaLogger.error(`[SQLITE_PROXY] Circuit breaker opened for ${this.adapterName} after ${this.consecutiveErrors} consecutive errors`, '', '');
      return true;
    }
    
    // Open immediately for certain fatal errors
    const errorMsg = error.message?.toLowerCase() || '';
    
    if (
      errorMsg.includes('disk i/o error') ||
      errorMsg.includes('database is locked') ||
      errorMsg.includes('readonly database') ||
      errorMsg.includes('unable to open database file')
    ) {
      this.circuitBreakerOpen = true;
      elizaLogger.error(`[SQLITE_PROXY] Circuit breaker opened immediately for ${this.adapterName} due to fatal error: ${errorMsg}`, '', '');
      return true;
    }
    
    return this.circuitBreakerOpen;
  }
  
  /**
   * Log detailed information about a SQLite error
   * @param method The method that failed
   * @param error The error that occurred
   * @param params Any parameters passed to the method
   */
  private logSqliteError(method: string, error: any, params?: any): void {
    elizaLogger.error(`[SQLITE_PROXY] Error in ${this.adapterName}.${method}: ${error.message || error}`, '', '');
    
    if (error.code) {
      elizaLogger.error(`[SQLITE_PROXY] SQLite error code: ${error.code}`, '', '');
    }
    
    if (error.errno) {
      elizaLogger.error(`[SQLITE_PROXY] SQLite errno: ${error.errno}`, '', '');
    }
    
    if (params) {
      elizaLogger.error(`[SQLITE_PROXY] Method parameters: ${JSON.stringify(params)}`, '', '');
    }
    
    if (error.stack) {
      elizaLogger.error(`[SQLITE_PROXY] Stack trace: ${error.stack}`, '', '');
    }
    
    this.lastError = error;
  }
  
  /**
   * Execute a query with enhanced error handling
   * @param sql SQL query to execute
   * @param params Parameters for the query
   * @returns Result of the query
   */
  async query(sql: string, params: any[] = []): Promise<any> {
    if (this.circuitBreakerOpen) {
      elizaLogger.warn(`[SQLITE_PROXY] Circuit breaker open, not executing query for ${this.adapterName}`, '', '');
      return null;
    }
    
    if (!this.adapter || !this.adapter.query) {
      elizaLogger.warn(`[SQLITE_PROXY] No query method available for ${this.adapterName}`, '', '');
      return null;
    }
    
    try {
      elizaLogger.debug(`[SQLITE_PROXY] Executing query on ${this.adapterName}: ${sql}`, '', '');
      const result = await this.adapter.query(sql, params);
      this.resetCircuitBreaker();
      return result;
    } catch (error) {
      this.logSqliteError('query', error, { sql, params });
      this.shouldOpenCircuitBreaker(error);
      
      // Attempt health check after error
      this.checkHealth();
      
      throw error;
    }
  }
  
  /**
   * Execute a statement with enhanced error handling
   * @param sql SQL statement to execute
   * @param params Parameters for the statement
   * @returns Result of the execution
   */
  async execute(sql: string, params: any[] = []): Promise<any> {
    if (this.circuitBreakerOpen) {
      elizaLogger.warn(`[SQLITE_PROXY] Circuit breaker open, not executing statement for ${this.adapterName}`, '', '');
      return null;
    }
    
    if (!this.adapter || !this.adapter.execute) {
      elizaLogger.warn(`[SQLITE_PROXY] No execute method available for ${this.adapterName}`, '', '');
      return null;
    }
    
    try {
      elizaLogger.debug(`[SQLITE_PROXY] Executing statement on ${this.adapterName}: ${sql}`, '', '');
      const result = await this.adapter.execute(sql, params);
      this.resetCircuitBreaker();
      return result;
    } catch (error) {
      this.logSqliteError('execute', error, { sql, params });
      this.shouldOpenCircuitBreaker(error);
      
      // Attempt health check after error
      this.checkHealth();
      
      throw error;
    }
  }
  
  /**
   * Create a memory with enhanced error handling
   * @param content Memory content
   * @returns Created memory or null on error
   */
  async createMemory(content: any): Promise<any> {
    if (this.circuitBreakerOpen) {
      elizaLogger.warn(`[SQLITE_PROXY] Circuit breaker open, not creating memory for ${this.adapterName}`, '', '');
      return null;
    }
    
    if (!this.adapter || !this.adapter.createMemory) {
      elizaLogger.warn(`[SQLITE_PROXY] No createMemory method available for ${this.adapterName}`, '', '');
      return null;
    }
    
    try {
      elizaLogger.debug(`[SQLITE_PROXY] Creating memory on ${this.adapterName}`, '', '');
      const result = await this.adapter.createMemory(content);
      this.resetCircuitBreaker();
      return result;
    } catch (error) {
      this.logSqliteError('createMemory', error, { contentSample: typeof content === 'string' ? content.substring(0, 100) : 'non-string content' });
      this.shouldOpenCircuitBreaker(error);
      
      // Attempt health check after error
      this.checkHealth();
      
      // Unlike other methods, don't throw but return null
      return null;
    }
  }
  
  /**
   * Search memories with enhanced error handling
   * @param query Search query
   * @param limit Maximum number of results
   * @returns Search results or empty array on error
   */
  async searchMemories(query: any, limit: number = 5): Promise<any[]> {
    if (this.circuitBreakerOpen) {
      elizaLogger.warn(`[SQLITE_PROXY] Circuit breaker open, not searching memories for ${this.adapterName}`, '', '');
      return [];
    }
    
    if (!this.adapter || !this.adapter.searchMemories) {
      elizaLogger.warn(`[SQLITE_PROXY] No searchMemories method available for ${this.adapterName}`, '', '');
      return [];
    }
    
    try {
      elizaLogger.debug(`[SQLITE_PROXY] Searching memories on ${this.adapterName}`, '', '');
      const result = await this.adapter.searchMemories(query, limit);
      this.resetCircuitBreaker();
      return result || [];
    } catch (error) {
      this.logSqliteError('searchMemories', error, { query, limit });
      this.shouldOpenCircuitBreaker(error);
      
      // Attempt health check after error
      this.checkHealth();
      
      // Return empty array rather than throwing
      return [];
    }
  }
  
  /**
   * Save a memory with enhanced error handling
   * @param memory Memory to save
   * @returns void
   */
  async saveMemory(memory: any): Promise<void> {
    if (this.circuitBreakerOpen) {
      elizaLogger.warn(`[SQLITE_PROXY] Circuit breaker open, not saving memory for ${this.adapterName}`, '', '');
      return;
    }
    
    if (!this.adapter || !this.adapter.saveMemory) {
      elizaLogger.warn(`[SQLITE_PROXY] No saveMemory method available for ${this.adapterName}`, '', '');
      return;
    }
    
    try {
      elizaLogger.debug(`[SQLITE_PROXY] Saving memory on ${this.adapterName}`, '', '');
      await this.adapter.saveMemory(memory);
      this.resetCircuitBreaker();
    } catch (error) {
      this.logSqliteError('saveMemory', error, { 
        memoryId: memory?.id, 
        contentSample: memory?.content ? 
          (typeof memory.content === 'string' ? 
            memory.content.substring(0, 100) : 
            'non-string content') : 
          'no content' 
      });
      
      this.shouldOpenCircuitBreaker(error);
      
      // Attempt health check after error
      this.checkHealth();
      
      // Don't throw, just log
    }
  }
  
  /**
   * Get the last error that occurred
   * @returns The last error or null if no error has occurred
   */
  getLastError(): Error | null {
    return this.lastError;
  }
  
  /**
   * Check if the adapter is healthy
   * @returns True if the adapter is healthy, false otherwise
   */
  isHealthy(): boolean {
    return this.healthyConnection && !this.circuitBreakerOpen;
  }
  
  /**
   * Force reset the circuit breaker and retry using the adapter
   */
  forceReset(): void {
    elizaLogger.info(`[SQLITE_PROXY] Forcing reset of circuit breaker for ${this.adapterName}`, '', '');
    this.resetCircuitBreaker();
    this.healthyConnection = true;
    this.lastError = null;
    this.consecutiveErrors = 0;
    
    // Perform a health check after reset
    this.checkHealth();
  }
  
  /**
   * Create a diagnostic report about the adapter state
   * @returns Object with diagnostic information
   */
  getDiagnostics(): any {
    return {
      adapterName: this.adapterName,
      healthy: this.healthyConnection,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveErrors: this.consecutiveErrors,
      adapterAvailable: !!this.adapter,
      lastError: this.lastError ? {
        message: this.lastError.message,
        stack: this.lastError.stack,
        code: (this.lastError as any).code,
        errno: (this.lastError as any).errno
      } : null
    };
  }
} 