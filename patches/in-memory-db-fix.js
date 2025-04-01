/**
 * In-Memory Database Fix
 * This patch ensures the system uses an in-memory SQLite database
 */

console.log('[IN-MEMORY-DB-FIX] Enforcing in-memory database usage');

/**
 * Configure the system to use an in-memory SQLite database
 */
export function enforceInMemoryDb() {
  // Set environment variable to signal in-memory mode
  process.env.USE_IN_MEMORY_DB = 'true';
  
  // Patch any database adapter initialization to use :memory:
  if (globalThis.__elizaRuntime) {
    console.log('[IN-MEMORY-DB-FIX] Patching ElizaOS runtime for in-memory database');
    
    // Override any getSetting calls that might look for a database path
    const originalGetSetting = globalThis.__elizaRuntime.getSetting;
    if (typeof originalGetSetting === 'function') {
      globalThis.__elizaRuntime.getSetting = function(key, defaultValue) {
        if (key === 'SQLITE_FILE' || key === 'DATABASE_PATH' || key === 'SQLITE_DATABASE_PATH') {
          console.log(`[IN-MEMORY-DB-FIX] Intercepted getSetting for ${key}, returning :memory:`);
          return ':memory:';
        }
        return originalGetSetting.call(this, key, defaultValue);
      };
    }
  }
  
  console.log('[IN-MEMORY-DB-FIX] In-memory database mode enforced');
  return true;
}

// Apply the fix immediately
const inMemoryEnabled = enforceInMemoryDb();

// Export the configuration result
export default inMemoryEnabled; 