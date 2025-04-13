#!/usr/bin/env node

/**
 * init_db.js
 * 
 * Initialize the SQLite database for ElizaOS with the required schema
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database path
const dbPath = path.join(dataDir, 'db.sqlite');
console.log(`Initializing SQLite database at ${dbPath}`);

// Connect to database
const db = new Database(dbPath);

// Create schema as specified in the runtime_territory_survival_kit.md
db.exec(`
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

console.log('✅ Database schema initialized.');
db.close(); 