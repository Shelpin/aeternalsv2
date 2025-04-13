/**
 * SQLite Path Fix
 * 
 * This patch ensures the SQLite database is in the correct path
 * by resolving paths relative to the project root.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Applying SQLite path fix...');

// Determine the project root
const projectRoot = path.resolve(__dirname, '..');
console.log(`📂 Project root: ${projectRoot}`);

// Ensure data directory exists
const dataDir = path.join(projectRoot, 'data');
if (!fs.existsSync(dataDir)) {
  console.log(`📂 Creating data directory: ${dataDir}`);
  fs.mkdirSync(dataDir, { recursive: true });
}

// Define the default SQLite path
const defaultSqlitePath = path.join(dataDir, 'db.sqlite');
console.log(`📂 Default SQLite path: ${defaultSqlitePath}`);

// Set environment variables if not already set
if (!process.env.SQLITE_FILE) {
  console.log(`⚠️ SQLITE_FILE not set, using default: ${defaultSqlitePath}`);
  process.env.SQLITE_FILE = defaultSqlitePath;
}

if (!process.env.DATABASE_PATH) {
  console.log(`⚠️ DATABASE_PATH not set, using default: ${defaultSqlitePath}`);
  process.env.DATABASE_PATH = defaultSqlitePath;
}

// Patch runtime if available
if (globalThis.__elizaRuntime) {
  const runtime = globalThis.__elizaRuntime;

  // Patch getSetting to return the correct database path
  const originalGetSetting = runtime.getSetting;
  if (typeof originalGetSetting === 'function') {
    runtime.getSetting = function (key, defaultValue) {
      if (key === 'SQLITE_FILE' || key === 'DATABASE_PATH') {
        return process.env[key] || defaultSqlitePath;
      }
      return originalGetSetting.call(this, key, defaultValue);
    };

    console.log('✅ Patched runtime.getSetting for database paths');
  }
}

console.log('✅ SQLite path fix applied'); 