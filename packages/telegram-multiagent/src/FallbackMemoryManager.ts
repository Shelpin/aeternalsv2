import { Memory, MemoryData, MemoryQuery } from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Fallback Memory Manager
 * 
 * This is a simple in-memory implementation of the Memory Manager
 * that can be used as a fallback when the real memory manager
 * is not available.
 */

// Define the options interface
interface MemoryOptions {
  limit?: number;
  type?: string;
  roomId?: string | null;
}

export class FallbackMemoryManager {
  private memories: Memory[] = [];
  private nextId = 1;
  private dbAdapter: any; // Adapter for SQLite operations
  private agentId: string;
  private logger: any;
  private useSqlite: boolean = true; // Explicitly toggle SQLite use
  private dbInitialized: boolean = false;
  private lastSqliteError: Error | null = null;
  private consecutiveSqliteErrors: number = 0;
  private maxConsecutiveSqliteErrors: number = 3;
  private maxMemories: number = 1000;  // Maximum number of memories to keep in memory

  // Add connection pooling
  private connectionPool = {
    connections: [] as Array<{ conn: any, inUse: boolean }>,
    maxSize: 5,
    getConnection() {
      for (let conn of this.connections) {
        if (!conn.inUse) {
          conn.inUse = true;
          return conn.conn;
        }
      }
      return null;
    },
    addConnection(conn: any) {
      if (this.connections.length < this.maxSize) {
        this.connections.push({ conn, inUse: true });
        return conn;
      }
      return null;
    },
    releaseConnection(conn: any) {
      for (let c of this.connections) {
        if (c.conn === conn) {
          c.inUse = false;
          break;
        }
      }
    }
  };

  constructor(agentId: string = 'unknown', dbAdapter?: any, logger?: any, useSqlite: boolean = true) {
    this.agentId = agentId;
    this.dbAdapter = dbAdapter;
    this.logger = logger || console;
    this.useSqlite = useSqlite;

    // VALHALLA FIX: Log info about the database adapter and SQLite usage
    if (dbAdapter && this.useSqlite) {
      this.logger.info(`[MEMORY] FallbackMemoryManager initialized with database adapter for agent ${agentId}. SQLite mode: ENABLED`, '', '');
      // Add the adapter to the connection pool
      this.connectionPool.addConnection(dbAdapter);
    } else if (dbAdapter && !this.useSqlite) {
      this.logger.info(`[MEMORY] FallbackMemoryManager initialized with database adapter for agent ${agentId}, but SQLite is DISABLED by configuration. Using in-memory storage.`, '', '');
      this.dbAdapter = null; // Force in-memory mode if SQLite is disabled
    } else {
      this.logger.warn(`[MEMORY] FallbackMemoryManager initialized WITHOUT database adapter for agent ${agentId}, will use in-memory storage`, '', '');
    }

    // Initialize schema if adapter is available
    if (this.dbAdapter && this.useSqlite) {
      this.logger.info(`[MEMORY] Initializing SQLite schema for agent ${agentId}`, '', '');
      this.initializeSchema().catch(err => {
        this.logger.error(`[MEMORY] Failed to initialize schema: ${err instanceof Error ? err.message : JSON.stringify(err)}`, '', '');
        this.logger.error(`[MEMORY] Stack trace: ${err instanceof Error ? err.stack : 'No stack trace available'}`, '', '');
      });
    } else {
      this.logger.info(`[MEMORY] SQLite fallback: ${this.useSqlite ? 'ON' : 'OFF'}`, '', '');
    }

    // Automatically test SQLite connection if adapter is provided
    if (this.dbAdapter) {
      this.testSqliteConnection().then(result => {
        this.logger.info(`[MEMORY] SQLite connectivity test ${result ? 'passed' : 'failed'}`, '', '');
      }).catch(error => {
        this.logger.error(`[MEMORY] Error testing SQLite connectivity: ${error instanceof Error ? error.message : JSON.stringify(error)}`, '', '');
        this.useSqlite = false;
      });
    }
  }

  // VALHALLA FIX: Add public getter for useSqlite
  getUseSqlite(): boolean {
    return this.useSqlite;
  }

  /**
   * Initialize the database schema
   */
  private async initializeSchema(): Promise<boolean> {
    if (!this.dbAdapter || !this.useSqlite) {
      return false;
    }

    if (this.dbInitialized) {
      return true;
    }

    // VALHALLA FIX: Add retry mechanism for schema initialization
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        this.logger.debug(`[MEMORY] Initializing SQLite schema (attempt ${retryCount + 1}/${maxRetries})`, '', '');

        // VALHALLA FIX: Forcefully close and reset the connection if we're retrying
        if (retryCount > 0) {
          this.logger.warn(`[MEMORY] Retry attempt ${retryCount + 1}: Resetting SQLite connection`, '', '');
          try {
            await this.dbAdapter.close();
          } catch (closeErr: unknown) {
            if (closeErr instanceof Error) {
              this.logger.warn(`[MEMORY] Error closing adapter: ${closeErr.message}`, '', '');
            } else {
              this.logger.warn(`[MEMORY] Error closing adapter: ${JSON.stringify(closeErr)}`, '', '');
            }
            // Continue anyway
          }
        }

        // VALHALLA FIX: Try to drop the table completely if this is a retry
        // Wrapped in proper error handling to avoid database lockup
        if (retryCount > 0) {
          try {
            this.logger.warn(`[MEMORY] Checking if memories table exists before dropping`, '', '');
            const tableCheck = await this.dbAdapter.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`);

            if (tableCheck && tableCheck.length > 0) {
              this.logger.warn(`[MEMORY] Forcefully dropping memories table to recreate it`, '', '');
              try {
                await this.dbAdapter.execute(`DROP TABLE IF EXISTS memories`);
                this.logger.info(`[MEMORY] Successfully dropped memories table`, '', '');
              } catch (dropErr: unknown) {
                if (dropErr instanceof Error) {
                  this.logger.warn(`[MEMORY] Could not drop table: ${dropErr.message}`, '', '');
                } else {
                  this.logger.warn(`[MEMORY] Could not drop table: ${JSON.stringify(dropErr)}`, '', '');
                }
                // Wait a moment before continuing to allow any locks to clear
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } else {
              this.logger.info(`[MEMORY] No existing memories table found, skipping drop operation`, '', '');
            }
          } catch (checkErr: unknown) {
            if (checkErr instanceof Error) {
              this.logger.warn(`[MEMORY] Error checking table existence: ${checkErr.message}`, '', '');
            } else {
              this.logger.warn(`[MEMORY] Error checking table existence: ${JSON.stringify(checkErr)}`, '', '');
            }
            // Continue anyway
          }
        }

        // VALHALLA FIX: Improved schema with explicit type column definition
        // Create memories table if it doesn't exist
        const createMemoriesTable = `
          CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'message',
            agent_id TEXT NOT NULL,
            user_id TEXT,
            timestamp INTEGER,
            content TEXT NOT NULL
          )
        `;

        await this.dbAdapter.execute(createMemoriesTable);

        // Check if the table was actually created
        const checkTable = await this.dbAdapter.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`);
        if (!checkTable || checkTable.length === 0) {
          throw new Error("Table creation didn't succeed - table not found in sqlite_master");
        }

        // Verify the schema to ensure type column exists
        try {
          const tableInfo = await this.dbAdapter.query(`PRAGMA table_info(memories)`);
          const typeColumn = (tableInfo as any[]).find((col: any) => col.name === 'type');

          if (!typeColumn) {
            this.logger.warn(`[MEMORY] 'type' column not found in memories table, attempting to add it`, '', '');
            await this.dbAdapter.execute(`ALTER TABLE memories ADD COLUMN type TEXT NOT NULL DEFAULT 'message'`);
            this.logger.info(`[MEMORY] Successfully added 'type' column to memories table`, '', '');
          } else {
            this.logger.info(`[MEMORY] 'type' column exists in memories table`, '', '');
          }
        } catch (schemaErr: unknown) {
          if (schemaErr instanceof Error) {
            this.logger.error(`[MEMORY] Error checking schema: ${schemaErr.message}`, '', '');
          } else {
            this.logger.error(`[MEMORY] Error checking schema: ${JSON.stringify(schemaErr)}`, '', '');
          }
          // Continue anyway, we'll handle errors during insertions
        }

        // Create indexes
        const createTypeIndex = `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type)`;
        await this.dbAdapter.execute(createTypeIndex);

        const createAgentIndex = `CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories (agent_id)`;
        await this.dbAdapter.execute(createAgentIndex);

        const createTimestampIndex = `CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories (timestamp DESC)`;
        await this.dbAdapter.execute(createTimestampIndex);

        // Verify we can do a basic query on the table
        await this.dbAdapter.query('SELECT COUNT(*) FROM memories');

        this.logger.info('[MEMORY] SQLite schema initialized successfully', '', '');
        this.dbInitialized = true;

        // Reset error counter on successful initialization
        this.consecutiveSqliteErrors = 0;

        return true;
      } catch (error: unknown) {
        lastError = error;
        retryCount++;
        if (error instanceof Error) {
          this.logger.error(`[MEMORY] Schema initialization attempt ${retryCount} failed: ${error.message}`, '', '');
        } else {
          this.logger.error(`[MEMORY] Schema initialization attempt ${retryCount} failed: ${JSON.stringify(error)}`, '', '');
        }
        if (retryCount < maxRetries) {
          // Wait before retrying (exponential backoff)
          const waitTime = Math.pow(2, retryCount) * 500; // 1s, 2s, 4s
          this.logger.warn(`[MEMORY] Waiting ${waitTime}ms before retry...`, '', '');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    this.handleSqliteError('schema initialization', lastError);

    // VALHALLA FIX: Force in-memory mode if schema initialization fails
    this.logger.warn('⚠️ [MEMORY] SQLite adapter failed schema check after multiple retries, forcing in-memory mode');
    this.dbAdapter = null;
    this.useSqlite = false;

    return false;
  }

  /**
   * Create a memory entry for a message
   * @param memoryData The memory data object
   * @returns The created memory, if successful
   */
  async createMemory(memoryData: MemoryData): Promise<MemoryData | null> {
    try {
      // Extract the content from the memoryData structure
      const { content, roomId, userId, type } = memoryData;
      const contentText = content?.text || '';
      const memoryId = uuidv4();

      this.logger.info(`[MEMORY] Creating Memory ${memoryId} ${contentText.substring(0, 50)}...`, '', '');

      // Create a complete memory object with any missing fields filled in
      const completeMemory: MemoryData = {
        id: memoryId,
        roomId: roomId || ('telegram-' + this.agentId),
        userId: userId || 'user',
        type: type || 'message',
        content: content || { text: '' }
      };

      // Also store in our in-memory array as backup in all cases
      this.memories.push({
        id: memoryId,
        type: completeMemory.type || 'message',
        content: completeMemory.content,
        userId: completeMemory.userId,
        roomId: completeMemory.roomId,
        createdAt: new Date()
      });

      // VALHALLA FIX: Skip database operation entirely if adapter is null
      if (!this.dbAdapter) {
        // Skip DB attempt entirely
        this.logger.info(`[MEMORY] Saving memory in-memory only`);
        return completeMemory;
      }

      // Create a memory in the database if adapter is available and SQLite is enabled
      if (this.dbAdapter && this.useSqlite) {
        try {
          // Ensure the table exists
          await this.initializeSchema();

          const timestamp = Date.now();

          // Try to insert memory into database
          try {
            const insertSql = `INSERT INTO memories (id, type, agent_id, user_id, timestamp, content)
                 VALUES (?, ?, ?, ?, ?, ?)`;
            const insertParams = [
              memoryId,
              completeMemory.type || 'message',
              this.agentId,
              completeMemory.userId,
              timestamp,
              JSON.stringify(completeMemory.content)  // Store content as JSON string
            ];

            this.logger.debug(`[MEMORY] Executing SQL: ${insertSql} with params: ${JSON.stringify(insertParams)}`, '', '');

            await this.dbAdapter.execute(insertSql, insertParams);

            this.logger.info(`[MEMORY] Successfully stored memory ${memoryId} in SQLite`, '', '');

            // Verify memory was saved
            try {
              const verifySql = `SELECT * FROM memories WHERE id = ?`;
              this.logger.debug(`[MEMORY] Verifying memory storage with SQL: ${verifySql} and id: ${memoryId}`, '', '');
              const verifyResult = await this.dbAdapter.query(verifySql, [memoryId]);

              if (verifyResult && verifyResult.length > 0) {
                this.logger.info(`[MEMORY] Memory verification successful. Memory exists in database.`, '', '');
              } else {
                this.logger.warn(`[MEMORY] Memory verification failed. Memory not found in database after insert.`, '', '');
              }
            } catch (verifyError: unknown) {
              this.logger.error(`[MEMORY] Memory verification error: ${verifyError instanceof Error ? verifyError.message : JSON.stringify(verifyError)}`);
            }
          } catch (insertError: unknown) {
            // Log insert error but continue with in-memory storage
            this.logger.error(`[MEMORY] SQLite error inserting memory: ${insertError instanceof Error ? insertError.message : JSON.stringify(insertError)}`);
            this.logger.error(`[MEMORY] Insert error stack trace: ${insertError instanceof Error ? insertError.stack : 'No stack trace available'}`);
            this.logger.error(`[MEMORY] Insert error code: ${insertError instanceof Error && 'code' in insertError ? insertError.code : 'Unknown'}`);
            this.logger.warn('[MEMORY] Using in-memory fallback due to insert error', '', '');
          }
        } catch (error: unknown) {
          // VALHALLA FIX: Enhanced error logging with full details
          this.logger.error(`[MEMORY] SQLite error creating memory: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
          if (error instanceof Error && 'code' in error) {
            this.logger.error(`[MEMORY] SQLite error code: ${(error as any).code}`);
          }
          if (error instanceof Error && error.stack) {
            this.logger.error(`[MEMORY] Stack trace: ${error.stack}`);
          }
          this.logger.warn('[MEMORY] Continuing with in-memory storage due to database error', '', '');
        }
      } else {
        this.logger.info('[MEMORY] Using virtual memory (SQLite adapter not available or disabled)', '', '');
      }

      // Always return the memory data regardless of SQLite success
      return completeMemory;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[MEMORY] Unexpected error creating memory: ${error.message}`, '', '');
        this.logger.error(`[MEMORY] Error stack trace: ${error.stack || 'No stack trace available'}`, '', '');
      } else {
        this.logger.error(`[MEMORY] Unexpected error creating memory: ${JSON.stringify(error)}`, '', '');
      }
      // Return a basic memory even in case of error to prevent null returns
      return {
        id: uuidv4(),
        roomId: 'telegram-' + this.agentId,
        userId: 'user',
        type: 'message',
        content: {
          text: 'Error retrieving message content'
        }
      };
    }
  }

  /**
   * Search memories in storage
   * @param query Search parameters
   * @param limit Maximum number of results to return
   * @returns Array of matching memories
   */
  async searchMemories(query: MemoryQuery, limit: number = 5): Promise<Memory[]> {
    // First try to use database if adapter is available and SQLite is enabled
    if (this.dbAdapter && this.useSqlite) {
      try {
        const searchSql = `SELECT * FROM memories WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`;
        const searchParams: (string | number)[] = [this.agentId, limit];
        this.logger.debug(`[MEMORY] Searching memories with SQL: ${searchSql} and params: ${JSON.stringify(searchParams)}`, '', '');
        // Get connection from pool
        let conn = this.connectionPool.getConnection();
        if (!conn) {
          conn = this.connectionPool.addConnection(this.dbAdapter);
        }

        if (!conn) {
          this.logger.warn(`[MEMORY] Failed to get connection from pool, falling back to in-memory search`, '', '');
          return this.memories.slice(0, limit);
        }

        try {
          const result = await conn.query(searchSql, searchParams) as Array<{
            id: string;
            type: string;
            content: string;
            user_id: string;
            roomId?: string;
            timestamp: number;
          }>;

          this.connectionPool.releaseConnection(conn);

          if (result && result.length > 0) {
            this.logger.info(`[MEMORY] Found ${result.length} memories in database`, '', '');

            return result.map((row): Memory => {
              const parsedContent = this.parseContent(row.content);
              return {
                id: row.id,
                type: row.type || 'message',
                content: parsedContent || { text: '' },
                userId: row.user_id || 'user',
                roomId: row.roomId || ('telegram-' + this.agentId),
                createdAt: new Date(row.timestamp || Date.now())
              };
            });
          } else {
            this.logger.info(`[MEMORY] No memories found in database, falling back to in-memory search`, '', '');
          }
        } catch (error: unknown) {
          if (conn) {
            this.connectionPool.releaseConnection(conn);
          }
          throw error;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`[MEMORY] Error searching memories in database: ${error.message}`, '', '');
          this.logger.error(`[MEMORY] Search error stack trace: ${error.stack || 'No stack trace available'}`, '', '');
        } else {
          this.logger.error(`[MEMORY] Error searching memories in database: ${JSON.stringify(error)}`, '', '');
        }
        this.logger.warn('[MEMORY] Falling back to in-memory search', '', '');
      }
    } else {
      this.logger.info(`[MEMORY] Using in-memory search (SQLite ${this.dbAdapter ? 'disabled' : 'not available'})`, '', '');
    }
    return this.memories.slice(0, limit);
  }

  /**
   * Save a memory to storage
   * @param memory Memory object to save
   */
  async saveMemory(memory: Memory): Promise<void> {
    if (!memory.id) {
      memory.id = `mem_${this.nextId++}`;
    }

    // Ensure we have valid memory data
    const validatedMemory: Memory = {
      ...memory,
      id: memory.id,
      roomId: memory.roomId || '',
      userId: memory.userId || 'user',
      type: memory.type || 'message',
      createdAt: memory.createdAt || new Date(),
      content: memory.content || { text: '' }
    };

    // Always save to in-memory storage first
    this.memories.push(validatedMemory);

    // Trim memory array if it exceeds the maximum size
    if (this.memories.length > this.maxMemories) {
      this.memories = this.memories.slice(-this.maxMemories);
    }

    // If SQLite is available and enabled, save to the database
    if (this.dbAdapter && this.useSqlite) {
      try {
        const saveSql = `INSERT INTO memories (id, type, agent_id, user_id, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`;
        const timestamp = validatedMemory.createdAt.getTime();
        const contentString = typeof validatedMemory.content === 'object'
          ? JSON.stringify(validatedMemory.content)
          : String(validatedMemory.content);

        const saveParams: (string | number)[] = [
          validatedMemory.id,
          validatedMemory.type || 'message',
          this.agentId,
          validatedMemory.userId || 'user',
          contentString,
          timestamp
        ];

        this.logger.debug(`[MEMORY] Saving memory with SQL: ${saveSql} and params: ${JSON.stringify(saveParams)}`, '', '');

        let conn = this.connectionPool.getConnection();
        if (!conn) {
          conn = this.connectionPool.addConnection(this.dbAdapter);
        }

        if (!conn) {
          this.logger.warn(`[MEMORY] Failed to get connection from pool for saveMemory`, '', '');
          return;
        }

        try {
          await conn.execute(saveSql, saveParams);
          this.connectionPool.releaseConnection(conn);
          this.logger.info(`[MEMORY] Successfully saved memory ${validatedMemory.id} to SQLite`, '', '');
        } catch (error: unknown) {
          if (conn) {
            this.connectionPool.releaseConnection(conn);
          }
          throw error;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`[MEMORY] Error saving memory to database: ${error.message}`, '', '');
          this.logger.error(`[MEMORY] Save error stack trace: ${error.stack || 'No stack trace available'}`, '', '');
        } else {
          this.logger.error(`[MEMORY] Error saving memory to database: ${JSON.stringify(error)}`, '', '');
        }
        this.logger.warn('[MEMORY] Memory saved to in-memory store only', '', '');
      }
    } else {
      this.logger.info('[MEMORY] Memory saved to in-memory store only (SQLite not available or disabled)', '', '');
    }
  }

  /**
   * Test the SQLite connectivity and schema
   * @returns True if SQLite is working properly, false otherwise
   */
  async testSqliteConnection(): Promise<boolean> {
    try {
      // Reset to defaults
      this.lastSqliteError = null;
      this.consecutiveSqliteErrors = 0;

      // Check if we have an adapter
      if (!this.dbAdapter) {
        this.logger.warn('[MEMORY] No SQLite adapter available', '', '');
        this.useSqlite = false;
        return false;
      }

      // Try to execute a simple query to test connectivity
      this.logger.info('[MEMORY] Testing SQLite connectivity...', '', '');

      // Step 1: Ensure schema exists
      const schemaInitialized = await this.initializeSchema();
      if (!schemaInitialized) {
        this.logger.error('[MEMORY] Failed to initialize schema during connection test', '', '');
        return false;
      }

      // Step 2: Try to insert a test record
      const testId = `test-${Date.now()}`;
      const testTimestamp = Date.now();

      try {
        const insertSql = `INSERT INTO memories (id, type, agent_id, user_id, timestamp, content)
            VALUES (?, ?, ?, ?, ?, ?)`;

        await this.dbAdapter.execute(insertSql, [
          testId,
          'test',
          this.agentId,
          'test_user',
          testTimestamp,
          JSON.stringify({ text: 'SQLite connectivity test' })
        ]);

        this.logger.info('[MEMORY] Successfully inserted test record', '', '');

        // Step 3: Try to read the test record
        const selectSql = `SELECT * FROM memories WHERE id = ?`;
        const result = await this.dbAdapter.query(selectSql, [testId]) as Array<{ id: string }>;

        if (result && result.length > 0) {
          this.logger.info('[MEMORY] Successfully read test record', '', '');

          // Step 4: Delete the test record
          const deleteSql = `DELETE FROM memories WHERE id = ?`;
          await this.dbAdapter.execute(deleteSql, [testId]);

          this.logger.info('[MEMORY] SQLite test completed successfully', '', '');
          this.useSqlite = true;
          this.dbInitialized = true;
          return true;
        } else {
          this.logger.error('[MEMORY] Failed to read test record', '', '');
          this.useSqlite = false;
          return false;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`[MEMORY] SQLite test failed: ${error.message}`, '', '');
          if (error.stack) {
            this.logger.error(`[MEMORY] Stack trace: ${error.stack}`, '', '');
          }
        } else {
          this.logger.error(`[MEMORY] SQLite test failed: ${JSON.stringify(error)}`, '', '');
        }
        this.lastSqliteError = error instanceof Error ? error : new Error(String(error));
        this.useSqlite = false;
        return false;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[MEMORY] SQLite connectivity test failed: ${error.message}`, '', '');
        if (error.stack) {
          this.logger.error(`[MEMORY] Stack trace: ${error.stack}`, '', '');
        }
      } else {
        this.logger.error(`[MEMORY] SQLite connectivity test failed: ${JSON.stringify(error)}`, '', '');
      }
      this.lastSqliteError = error instanceof Error ? error : new Error(String(error));
      this.useSqlite = false;
      return false;
    }
  }

  /**
   * Helper to safely parse content stored as a string
   */
  private parseContent(content: string | any): any {
    if (typeof content !== 'string') {
      return content;
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      // If parsing fails, return as-is in a text property
      return { text: content };
    }
  }

  /**
   * Get memories from storage
   * @param options Filter options for memories
   * @returns Array of memories matching the filter criteria
   */
  async getMemories(options: MemoryOptions = {}): Promise<Memory[]> {
    // Parse and validate options with defaults
    const limit: number = options.limit || 50;
    const type: string = options.type || 'chat';
    const roomId: string | null = options.roomId || null;

    // Use in-memory storage if SQLite is not available or disabled
    if (!this.dbAdapter || !this.useSqlite) {
      this.logger.debug('[MEMORY] Using in-memory storage only for getMemories', '', '');
      return this.getInMemoryMemories(options);
    }

    try {
      // Ensure schema is initialized
      const schemaInitialized = await this.initializeSchema();
      if (!schemaInitialized) {
        this.logger.warn('[MEMORY] Schema initialization failed, falling back to in-memory', '', '');
        return this.getInMemoryMemories(options);
      }

      // Build SQL query with proper type parameters
      let sql = `SELECT * FROM memories WHERE agent_id = ? AND type = ?`;
      const params: (string | number | null)[] = [this.agentId, type];

      // Add roomId filter if provided
      if (roomId) {
        sql += ` AND json_extract(content, '$.roomId') = ?`;
        params.push(roomId);
      }

      // Add order and limit
      sql += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);

      this.logger.debug(`[MEMORY] Executing SQL: ${sql} with params: ${JSON.stringify(params)}`, '', '');

      // Execute the query
      const results = await this.dbAdapter.query(sql, params) as Array<{
        id: string;
        type: string;
        content: string;
        user_id: string;
        timestamp: number;
      }> | null;

      // Fall back to in-memory if no results
      if (!results || results.length === 0) {
        this.logger.debug('[MEMORY] No memories found in SQLite, falling back to in-memory', '', '');
        return this.getInMemoryMemories(options);
      }

      // Reset error counter on success
      if (this.consecutiveSqliteErrors > 0) {
        this.logger.info('[MEMORY] Successfully retrieved memories from SQLite after previous errors, resetting error counter', '', '');
        this.consecutiveSqliteErrors = 0;
      }

      // Parse and map results to Memory objects
      const memories: Memory[] = results
        .map((row) => {
          try {
            const contentStr = row.content || '{}';
            const contentObj = this.parseContent(contentStr);

            return {
              id: row.id,
              roomId: (contentObj && typeof contentObj === 'object' && 'roomId' in contentObj) ?
                String(contentObj.roomId) : '',
              userId: row.user_id || 'unknown',
              type: row.type || 'chat',
              createdAt: new Date(row.timestamp || Date.now()),
              content: {
                text: (contentObj && typeof contentObj === 'object' && 'text' in contentObj) ?
                  String(contentObj.text) : '',
                metadata: (contentObj && typeof contentObj === 'object' && 'metadata' in contentObj) ?
                  contentObj.metadata : {}
              }
            };
          } catch (parseError: unknown) {
            if (parseError instanceof Error) {
              this.logger.error(`[MEMORY] Error parsing memory content: ${parseError.message}`, '', '');
            } else {
            }
            return null;
          }
        })
        .filter((m): m is any => m !== null) as Memory[];

      this.logger.debug(`[MEMORY] Retrieved ${memories.length} memories from SQLite`, '', '');
      return memories;
    } catch (error: unknown) {
      this.handleSqliteError('getMemories', error);
      this.logger.info('[MEMORY] Falling back to in-memory storage for getMemories', '', '');
      return this.getInMemoryMemories(options);
    }
  }

  /**
   * Get memories from in-memory storage
   * @private
   */
  private getInMemoryMemories(options: MemoryOptions = {}): Memory[] {
    const limit = options.limit || 50;
    const type = options.type || 'chat';
    const roomId = options.roomId || null;

    let filteredMemories = this.memories.filter(mem => {
      let match = mem.type === type;

      // Apply roomId filter if provided
      if (match && roomId !== null) {
        match = mem.roomId === roomId;
      }

      return match;
    });

    // Sort by timestamp descending
    filteredMemories.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA;
    });

    // Apply limit
    if (filteredMemories.length > limit) {
      filteredMemories = filteredMemories.slice(0, limit);
    }

    this.logger.debug(`[MEMORY] Retrieved ${filteredMemories.length} memories from in-memory storage`, '', '');

    return filteredMemories;
  }

  // Add a helper method to handle SQLite errors
  private handleSqliteError(operation: string, error: unknown): void {
    this.lastSqliteError = error instanceof Error ? error : new Error(String(error));
    this.consecutiveSqliteErrors++;
    if (error instanceof Error) {
      this.logger.error(`[MEMORY] SQLite error during ${operation}: ${error.message}`, '', '');
      if ('code' in error) {
        this.logger.error(`[MEMORY] SQLite error code: ${(error as any).code}`, '', '');
      }
      if (error.stack) {
        this.logger.error(`[MEMORY] Stack trace: ${error.stack}`, '', '');
      }
    } else {
      this.logger.error(`[MEMORY] SQLite error during ${operation}: ${JSON.stringify(error)}`, '', '');
    }
    // Disable SQLite after too many consecutive errors
    if (this.consecutiveSqliteErrors >= this.maxConsecutiveSqliteErrors) {
      this.logger.warn(`[MEMORY] Too many consecutive SQLite errors (${this.consecutiveSqliteErrors}), disabling SQLite`, '', '');
      this.useSqlite = false;
    }
  }

  /**
   * Add a memory to storage
   */
  async addMemory(memory: MemoryData): Promise<void> {
    this.logger.info(`[MEMORY] Inserting memory with content: ${JSON.stringify(memory)}`, '', '');
    if (!memory.createdAt) {
      (memory as any).createdAt = new Date();
    }
    const memoryObj: Memory = {
      id: memory.id || `memory-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      roomId: memory.roomId || '',
      userId: memory.userId || 'unknown',
      type: memory.type || 'chat',
      createdAt: (memory as any).createdAt || new Date(),
      content: {
        text: memory.content?.text || '',
        metadata: memory.content?.metadata || {}
      }
    };
    this.memories.push(memoryObj);
    if (this.memories.length > this.maxMemories) {
      this.memories = this.memories.slice(-this.maxMemories);
    }
    if (!this.dbAdapter || !this.useSqlite) {
      return;
    }
    try {
      await this.initializeSchema();
      const roomId = memoryObj.roomId || '';
      const sql = `\n        INSERT INTO memories (id, type, agent_id, user_id, timestamp, content)\n        VALUES (?, ?, ?, ?, ?, ?)\n      `;
      const timestamp = memoryObj.createdAt ? memoryObj.createdAt.getTime() : Date.now();
      const params: (string | number)[] = [
        memoryObj.id,
        memoryObj.type || 'chat',
        this.agentId,
        memoryObj.userId || '',
        timestamp,
        JSON.stringify({
          text: memoryObj.content.text,
          roomId: roomId,
          metadata: memoryObj.content.metadata || {}
        })
      ];
      await this.dbAdapter.execute(sql, params);
      if (this.consecutiveSqliteErrors > 0) {
        this.logger.info('[MEMORY] Successfully added memory to SQLite after previous errors, resetting error counter', '', '');
        this.consecutiveSqliteErrors = 0;
      }
      this.logger.debug(`[MEMORY] Added memory to SQLite: ${memoryObj.id}`, '', '');
    } catch (error: unknown) {
      this.handleSqliteError('addMemory', error);
      this.logger.info('[MEMORY] Memory still saved to in-memory fallback', '', '');
    }
  }
} 