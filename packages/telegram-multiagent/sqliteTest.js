// Simple SQLite test script
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function testSqlite() {
  try {
    console.log('======= Simple SQLite Test =======');
    
    // Initialize the SQLite adapter
    const dbPath = 'test_memory.db';
    console.log(`Opening SQLite database at ${dbPath}`);
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('SQLite database opened successfully');
    
    // Create a test table
    console.log('Creating test table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS test_memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        timestamp INTEGER,
        content TEXT NOT NULL
      )
    `);
    
    console.log('Test table created successfully');
    
    // Insert a test record
    console.log('Inserting test record...');
    const testId = `test-${Date.now()}`;
    await db.run(
      `INSERT INTO test_memories (id, type, agent_id, timestamp, content) VALUES (?, ?, ?, ?, ?)`,
      [testId, 'test', 'test-agent', Date.now(), JSON.stringify({ text: 'Test content' })]
    );
    
    console.log('Test record inserted successfully');
    
    // Query the test record
    console.log('Querying test record...');
    const rows = await db.all(
      `SELECT * FROM test_memories WHERE id = ?`, 
      [testId]
    );
    
    console.log(`Query results: ${rows.length} rows found`);
    console.log(JSON.stringify(rows, null, 2));
    
    // Delete the test record
    console.log('Deleting test record...');
    await db.run(
      `DELETE FROM test_memories WHERE id = ?`,
      [testId]
    );
    
    console.log('Test record deleted successfully');
    console.log('SQLite test completed successfully!');
    
  } catch (error) {
    console.error(`SQLite test failed: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
testSqlite(); 