// Test script for SQLite functionality in FallbackMemoryManager

import { FallbackMemoryManager } from './src/FallbackMemoryManager.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Simple logger for testing
const logger = {
  trace: (msg, ...args) => console.log(`[TRACE] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[ERROR] ${msg}`, ...args)
};

// SQLite adapter implementation
class SqliteAdapter {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }
  
  async init() {
    try {
      console.log(`Opening SQLite database at ${this.dbPath}`);
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      console.log('SQLite database opened successfully');
      return true;
    } catch (error) {
      console.error(`Error opening SQLite database: ${error.message}`);
      console.error(error.stack);
      return false;
    }
  }
  
  async query(sql, params = []) {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }
      
      console.log(`Executing query: ${sql}`);
      console.log(`Params: ${JSON.stringify(params)}`);
      
      const result = await this.db.all(sql, params);
      return result;
    } catch (error) {
      console.error(`Query error: ${error.message}`);
      throw error;
    }
  }
  
  async execute(sql, params = []) {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }
      
      console.log(`Executing SQL: ${sql}`);
      console.log(`Params: ${JSON.stringify(params)}`);
      
      await this.db.run(sql, params);
      return true;
    } catch (error) {
      console.error(`Execute error: ${error.message}`);
      throw error;
    }
  }
}

async function runTest() {
  try {
    console.log('======= SQLite Test =======');
    
    // Initialize the SQLite adapter
    const dbPath = 'test_memory.db';
    const adapter = new SqliteAdapter(dbPath);
    await adapter.init();
    
    // Create a FallbackMemoryManager with the adapter
    const manager = new FallbackMemoryManager('test-agent', adapter, logger);
    
    // Test SQLite connection
    console.log('Testing SQLite connection...');
    const connectionResult = await manager.testSqliteConnection();
    console.log(`SQLite connection test result: ${connectionResult ? 'PASSED' : 'FAILED'}`);
    
    if (!connectionResult) {
      console.error('SQLite test failed, aborting further tests');
      return;
    }
    
    // Create a test memory
    console.log('\nCreating test memory...');
    const testMemory = {
      id: `test-memory-${Date.now()}`,
      type: 'chat',
      from: { id: 'test-user', name: 'Test User' },
      text: 'This is a test memory',
      roomId: 'test-room',
      metadata: { test: true },
      createdAt: new Date()
    };
    
    await manager.addMemory(testMemory);
    console.log('Test memory created');
    
    // Get memories
    console.log('\nRetrieving memories...');
    const memories = await manager.getMemories({ 
      type: 'chat',
      roomId: 'test-room',
      limit: 10
    });
    
    console.log(`Retrieved ${memories.length} memories:`);
    memories.forEach(memory => {
      console.log(`- ID: ${memory.id}`);
      console.log(`  Type: ${memory.type}`);
      console.log(`  User: ${memory.userId}`);
      console.log(`  Room: ${memory.roomId}`);
      console.log(`  Text: ${memory.content.text}`);
      console.log(`  Created: ${memory.createdAt}`);
      console.log('---');
    });
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest(); 