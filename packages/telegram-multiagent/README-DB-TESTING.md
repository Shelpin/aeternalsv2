# Database Consolidation Testing Guide

This guide explains how to run tests for the database consolidation implementation in the ElizaOS Telegram Multi-Agent system.

## Overview

The database consolidation is a critical component that enables multiple agents to share a single database for conversation state, providing the foundation for coordinated multi-agent interactions.

## Available Tests

### 1. Basic Database Consolidation Test

Tests basic database creation, environment variable setup, and schema validation:

```bash
node consolidate-db.js --debug
```

### 2. Multi-Agent Database Sharing Test

Tests multiple agents writing to and reading from the shared database:

```bash
node test-db-sharing.js
```

This comprehensive test:
- Creates the consolidated database
- Verifies the schema
- Simulates multiple agents writing messages
- Verifies all agents can read each other's messages
- Tests conversation participant tracking

### 3. TypeScript Build Test

Verifies that the TypeScript compilation works with the updated code:

```bash
pnpm run build
```

## Running the Tests

To run all tests in sequence:

```bash
# Make sure you're in the telegram-multiagent package directory
cd packages/telegram-multiagent

# 1. Build the TypeScript code
pnpm run build

# 2. Run the database consolidation script
node consolidate-db.js --debug

# 3. Run the multi-agent database sharing test
node test-db-sharing.js
```

## Expected Results

### 1. Build Output

The build should complete without TypeScript errors:

```
> @elizaos/telegram-multiagent@ build /root/eliza/packages/telegram-multiagent
> tsc -p tsconfig.build.json
```

### 2. Database Consolidation Script Output

```
[INFO] Starting database consolidation process
[INFO] Using database path: /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db
[INFO] Set DATABASE_PATH and SQLITE_FILE to /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db
[INFO] Created database schema successfully
[INFO] Checking for obsolete database files...
[INFO] No obsolete database files found
[INFO] Consolidation completed successfully
```

### 3. Multi-Agent Test Output

```
=== Database Consolidation Multi-Agent Test ===
Testing database at path: /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db

=== Running Database Consolidation Script ===
Created empty database file: /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db
[INFO] Starting database consolidation process
[INFO] Using database path: /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db
[INFO] Set DATABASE_PATH and SQLITE_FILE to /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db
[INFO] Created database schema successfully
Database consolidation script completed successfully
Database file exists at: /root/eliza/packages/telegram-multiagent/data/telegram-multiagent.db

=== Verifying Database Structure ===
Found tables: [
  'telegram_groups',
  'agent_telegram_assignments',
  'conversation_topics',
  'agent_conversation_participants',
  'conversation_message_metrics',
  'sqlite_sequence',
  'agent_message_history'
]
All expected tables exist

=== Simulating Multiple Agents ===
Registering Telegram group...
Group registered successfully
Registering agent eth_memelord_9000 with group...
Registering agent bag_flipper_9000 with group...
Registering agent linda_evangelista_88 with group...
All agents registered with group
Creating conversation topic...
Conversation topic created successfully
Agent eth_memelord_9000 sending message...
Agent bag_flipper_9000 sending message...
Agent linda_evangelista_88 sending message...
All agents sent messages successfully

=== Verifying Cross-Agent Visibility ===
Agent eth_memelord_9000 can see all messages...
Agent bag_flipper_9000 can see all messages...
Agent linda_evangelista_88 can see all messages...
All agents properly registered as participants

=== Test Completed Successfully ===
Database consolidation works correctly with multiple agents.
All agents can share and access data in the consolidated database.
```

## Troubleshooting

### Database File Issues

If the test fails to create or access the database file:

1. Check directory permissions:
   ```bash
   mkdir -p data
   chmod 755 data
   ```

2. Verify the database path is correct in your environment:
   ```bash
   export DATABASE_PATH="./data/telegram-multiagent.db" 
   export SQLITE_FILE="./data/telegram-multiagent.db"
   ```

### TypeScript Compilation Errors

If you encounter TypeScript compilation errors:

1. Check that all dependencies are installed:
   ```bash
   pnpm install
   ```

2. Check for mismatched TypeScript versions:
   ```bash
   pnpm list typescript
   ```

3. Check for circular dependencies:
   ```bash
   pnpm exec madge --circular --extensions ts src/
   ```

## Next Steps

After confirming that the database consolidation is working correctly, proceed to Phase 1 of the implementation plan:

1. Complete the integration of TelegramCoordinationAdapter into ConversationManager
2. Remove any remaining FallbackMemoryManager references
3. Implement turn-taking using the shared database state 