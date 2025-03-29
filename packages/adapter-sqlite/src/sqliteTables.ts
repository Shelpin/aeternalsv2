import { elizaLogger } from "@elizaos/core";

// VALHALLA FIX: Add detailed schema version tracking for easier debugging
const SCHEMA_VERSION = "1.0.0";

// Create tables for SQLite database
export const sqliteTables = `
-- Schema version: ${SCHEMA_VERSION}
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  avatarUrl TEXT,
  details TEXT CHECK(json_valid(details) OR details IS NULL)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  updatedAt INTEGER DEFAULT (strftime('%s','now')),
  details TEXT CHECK(json_valid(details) OR details IS NULL)
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  userId TEXT NOT NULL,
  roomId TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  userState TEXT,
  last_message_read TEXT,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(userId, roomId),
  FOREIGN KEY (userId) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  roomId TEXT,
  agentId TEXT,
  userId TEXT,
  embedding BLOB,
  content TEXT NOT NULL CHECK(json_valid(content)),
  unique INTEGER DEFAULT 0,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  unique_content TEXT GENERATED ALWAYS AS (json_extract(content, '$.text')) STORED
);

CREATE INDEX IF NOT EXISTS memories_roomId_idx ON memories(roomId);
CREATE INDEX IF NOT EXISTS memories_agentId_idx ON memories(agentId);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);
CREATE INDEX IF NOT EXISTS memories_createdAt_idx ON memories(createdAt);
CREATE INDEX IF NOT EXISTS memories_unique_content_idx ON memories(unique_content) WHERE unique_content IS NOT NULL;

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  roomId TEXT NOT NULL,
  userId TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  updatedAt INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS goals_roomId_idx ON goals(roomId);
CREATE INDEX IF NOT EXISTS goals_userId_idx ON goals(userId);
CREATE INDEX IF NOT EXISTS goals_status_idx ON goals(status);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  userA TEXT NOT NULL,
  userB TEXT NOT NULL,
  type TEXT DEFAULT 'friend',
  state TEXT DEFAULT 'pending',
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  updatedAt INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(userA, userB),
  FOREIGN KEY (userA) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (userB) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS relationships_userA_idx ON relationships(userA);
CREATE INDEX IF NOT EXISTS relationships_userB_idx ON relationships(userB);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  roomId TEXT NOT NULL,
  userId TEXT,
  type TEXT NOT NULL,
  body TEXT NOT NULL CHECK(json_valid(body)),
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS logs_roomId_idx ON logs(roomId);
CREATE INDEX IF NOT EXISTS logs_userId_idx ON logs(userId);
CREATE INDEX IF NOT EXISTS logs_type_idx ON logs(type);
CREATE INDEX IF NOT EXISTS logs_createdAt_idx ON logs(createdAt);

CREATE TABLE IF NOT EXISTS cache (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  key TEXT NOT NULL,
  agentId TEXT NOT NULL,
  value TEXT NOT NULL,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  updatedAt INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(key, agentId)
);

CREATE INDEX IF NOT EXISTS cache_key_idx ON cache(key);
CREATE INDEX IF NOT EXISTS cache_agentId_idx ON cache(agentId);

CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  name TEXT,
  description TEXT,
  source TEXT,
  shared INTEGER DEFAULT 0,
  createdAt INTEGER DEFAULT (strftime('%s','now')),
  updatedAt INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS knowledge_agentId_idx ON knowledge(agentId);
CREATE INDEX IF NOT EXISTS knowledge_shared_idx ON knowledge(shared);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  content,
  name,
  description,
  content='knowledge',
  content_rowid='id'
);

-- Triggers for full-text search
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, content, name, description)
  VALUES (new.id, new.content, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, content, name, description)
  VALUES('delete', old.id, old.content, old.name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, content, name, description)
  VALUES('delete', old.id, old.content, old.name, old.description);
  INSERT INTO knowledge_fts(rowid, content, name, description)
  VALUES (new.id, new.content, new.name, new.description);
END;
`;

/**
 * Initialize SQLite database schema with proper error handling
 * @param db The SQLite database connection
 * @returns Promise<boolean> True if schema was successfully initialized
 */
export async function initializeSqliteSchema(db: any): Promise<boolean> {
  try {
    elizaLogger.info(`[SQLITE] Initializing SQLite schema version ${SCHEMA_VERSION}`, '', '');
    
    // First check if we can access the database at all
    try {
      const pragmaCheck = db.prepare('PRAGMA quick_check').get();
      elizaLogger.info(`[SQLITE] Database quick check: ${JSON.stringify(pragmaCheck)}`, '', '');
    } catch (pragmaError) {
      elizaLogger.error(`[SQLITE] Database access check failed: ${(pragmaError as Error).message}`, '', '');
      elizaLogger.error(`[SQLITE] Check file permissions and SQLite version`, '', '');
      return false;
    }
    
    // Try to execute the schema creation script
    try {
      // Split into separate statements to identify where errors occur
      const statements = sqliteTables.split(';');
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;
        
        try {
          db.exec(stmt + ';');
        } catch (stmtError) {
          elizaLogger.error(`[SQLITE] Error executing schema statement #${i+1}: ${(stmtError as Error).message}`, '', '');
          elizaLogger.error(`[SQLITE] Failed statement: ${stmt}`, '', '');
          throw stmtError;
        }
      }
      
      elizaLogger.info('[SQLITE] Schema successfully initialized', '', '');
      
      // Verify tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      elizaLogger.info(`[SQLITE] Created tables: ${tables.map((t: any) => t.name).join(', ')}`, '', '');
      
      return true;
    } catch (execError) {
      elizaLogger.error(`[SQLITE] Schema initialization failed: ${(execError as Error).message}`, '', '');
      return false;
    }
  } catch (error) {
    elizaLogger.error(`[SQLITE] Unexpected error during schema initialization: ${(error as Error).message}`, '', '');
    if ((error as Error).stack) {
      elizaLogger.error(`[SQLITE] Stack trace: ${(error as Error).stack}`, '', '');
    }
    return false;
  }
}