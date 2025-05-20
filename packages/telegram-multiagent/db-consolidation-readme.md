# Database Consolidation for Telegram Multi-Agent Plugin

## Overview

This document outlines the database consolidation process for the Telegram Multi-Agent plugin. The goal is to standardize all database access to use a single shared SQLite database file located at `data/telegram-multiagent.db`, using `TelegramCoordinationAdapter` as the single source of truth for all database operations.

## Problem Statement

The plugin currently has several issues with database management:

1. **Multiple Database Libraries**: A mix of `sqlite3`, `better-sqlite3`, and other libraries are used inconsistently
2. **Multiple Database Files**: Different components create their own database files in different locations
3. **Inconsistent Access Patterns**: Some components use direct database access, others use memory managers
4. **No Single Source of Truth**: This leads to data fragmentation and coordination problems

## Solution

We've implemented a comprehensive database consolidation solution with the following components:

### 1. DbConsolidationHelper Class

`DbConsolidationHelper` is a singleton class that provides:

- Standardized database path resolution
- Shared `SqliteDatabaseAdapter` instance
- Single `TelegramCoordinationAdapter` instance for all database operations
- Utilities for ensuring database directory exists, setting environment variables, etc.

### 2. Consolidation Script

`consolidate-db.js` is a command-line tool that:

- Checks for obsolete database files
- Sets up the canonical database path
- Optionally deletes obsolete files
- Validates the database schema

### 3. Schema Management

All schema definitions are centralized in `schema.ts` and managed by `TelegramCoordinationAdapter`.

## Usage

### Running the Consolidation Script

```bash
# Basic usage
node packages/telegram-multiagent/consolidate-db.js

# Delete obsolete database files
node packages/telegram-multiagent/consolidate-db.js --delete-obsolete

# Specify custom database path
node packages/telegram-multiagent/consolidate-db.js --db-path=/custom/path/db.sqlite

# Enable debug logging
node packages/telegram-multiagent/consolidate-db.js --debug
```

### Using DbConsolidationHelper in Code

```typescript
import { DbConsolidationHelper } from './DbConsolidationHelper.js';
import { ElizaLogger } from './types.js';

// Get singleton instance
const dbHelper = DbConsolidationHelper.getInstance(logger);

// Initialize with agent ID and runtime
await dbHelper.initialize('agent_id', runtime);

// Get coordination adapter for database operations
const coordinator = dbHelper.getCoordinationAdapter();

// Use the coordination adapter for all database operations
await coordinator.recordMessage({
  id: '123',
  conversationId: 'abc',
  senderId: 'agent1',
  content: 'Hello world',
  sentAt: Date.now(),
  isFollowUp: false
});

// Clean up resources when shutting down
await dbHelper.shutdown();
```

## Environment Variables

The consolidation process respects the following environment variables:

- `DATABASE_PATH`: Path to the database file
- `SQLITE_FILE`: Alternative path specification (takes precedence over DATABASE_PATH)

If neither variable is set, the default path `./data/telegram-multiagent.db` will be used.

## Best Practices

1. **Always use TelegramCoordinationAdapter**: Do not directly use SQLite or other database libraries
2. **Singleton Database Connection**: Use `DbConsolidationHelper` to get a shared instance
3. **Consistent Error Handling**: Handle database errors gracefully with proper logging
4. **Environment Variable Management**: Use the helper to ensure consistent environment variables

## Debugging

If you encounter database issues:

1. Run the consolidation script with `--debug` flag
2. Check for obsolete database files
3. Verify the database schema using `sqlite3` command-line tool:
   ```bash
   sqlite3 ./data/telegram-multiagent.db '.schema'
   ```
4. Use the `DbConsolidationHelper` to get diagnostic information:
   ```typescript
   const dbHelper = DbConsolidationHelper.getInstance();
   console.log('Database path:', dbHelper.getCanonicalDbPath());
   console.log('Initialized:', dbHelper.isInitialized());
   ```

## Migration Path

For existing components that directly use database access:

1. Replace direct database access with `TelegramCoordinationAdapter`
2. Update unit tests to use the consolidation helper
3. Remove any database-specific code in components
4. Ensure all data is properly migrated during consolidation

## Conclusion

This consolidation effort ensures that all database operations use a single shared database file, with consistent access patterns and proper error handling. By standardizing on `TelegramCoordinationAdapter`, we eliminate coordination problems and improve the reliability of the plugin. 