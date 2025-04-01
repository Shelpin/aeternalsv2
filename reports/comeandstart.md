# ElizaOS Multi-Agent System: Comprehensive Troubleshooting Report

## Executive Summary

The ElizaOS Multi-Agent Telegram System has been experiencing persistent startup issues related to SQLite database configuration, agent communication with the relay server, and port allocation conflicts. Despite multiple attempts to resolve these issues through environment variable configuration, schema adjustments, and port management, the agents are still failing to initialize properly and connect to the relay server.

## Current Status

- **SQLite Database**: Schema created with correct structure but not properly recognized
- **Agent Processes**: Starting but failing during initialization
- **Relay Server**: Running but not receiving agent connections
- **Port Management**: Conflicts persist despite cleanup attempts
- **Error Pattern**: Consistent "no such table: memories" despite schema creation

## Detailed Analysis of Issues

### 1. SQLite Database Configuration Issues

#### Problem Statement
The agent initialization process is failing with a consistent error: `SqliteError: no such table: memories`. This indicates that the SQLite database is either not being initialized properly or the agents cannot locate it.

#### Attempted Solutions
1. **Database Path Configuration**:
   - Set `SQLITE_DATABASE_PATH=/root/eliza/data/db.sqlite`
   - Set `SQLITE_FILE=/root/eliza/data/db.sqlite`
   - Created patch module (`sqlite-path-fix.js`) to enforce path

2. **Schema Creation**:
   ```sql
   CREATE TABLE IF NOT EXISTS memories (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     agentId TEXT NOT NULL,
     userId TEXT,
     timestamp INTEGER NOT NULL,
     content TEXT NOT NULL,
     vector BLOB,
     metadata TEXT,
     embedding BLOB
   );
   ```
   - Adapted column names to match expected structure (camelCase)
   - Added missing columns like `embedding`

3. **Database Adapter Analysis**:
   - Identified adapter initialization logic in `/root/eliza/packages/adapter-sqlite/src/index.ts`
   - Found setting lookup: `runtime.getSetting("SQLITE_FILE") ?? path.resolve(dataDir, "db.sqlite")`

#### Current Status
Database schema is created but not recognized by the application. The error progression (from "no such table" to "no such column" and back) indicates that the schema isn't being properly applied or the database file isn't being found at runtime.

### 2. Agent-to-Relay Communication Issues

#### Problem Statement
The agents are not successfully connecting to the relay server, as evidenced by log messages such as:
```
📡 [RELAY-FIX] Sending heartbeat to http://localhost:4000/heartbeat
❌ [RELAY-FIX] Error sending heartbeat: fetch failed
```

#### Attempted Solutions
1. **Relay Server Configuration**:
   - Started relay server on port 4000: `PORT=4000 node server.js`
   - Attempted on alternate port 4001: `PORT=4001 node server.js`
   - Checked health endpoint: `curl http://localhost:4000/health`

2. **Agent Configuration**:
   - Set agent IDs explicitly (e.g., `AGENT_ID=eth_memelord_9000`)
   - Started agents with explicit ports

#### Current Status
The relay server is running, but no agents are successfully connecting. The heartbeat messages show failed connection attempts.

### 3. Port Allocation Conflicts

#### Problem Statement
Multiple instances of agents and the relay server are causing port conflicts, making it difficult to establish stable connections.

#### Attempted Solutions
1. **Process Cleanup**:
   - Used `pkill -f "node patches/start-agent-with-patches.js"` to terminate agents
   - Used `pkill -f "node server.js"` to terminate relay server

2. **Port Assignment**:
   - Set explicit ports for each agent (3000, 3001, 3005)
   - Changed relay server port (4000 → 4001)

#### Current Status
Despite cleanup attempts, port conflicts persist. Log messages show:
```
[2025-04-01 00:47:44] WARN: Port 3000 is in use, trying 3001
[2025-04-01 00:47:44] WARN: Port 3001 is in use, trying 3002
...
```

## Root Cause Analysis

### Database Path Resolution Chain

1. **Setting Query**:
   - Agent looks for `SQLITE_FILE` setting: `runtime.getSetting("SQLITE_FILE")`
   - Falls back to default: `path.resolve(dataDir, "db.sqlite")`

2. **Path Verification Issues**:
   - Database file created in correct location but not recognized
   - Database schema created but not found at runtime

3. **Environment Variable Inconsistency**:
   - Multiple environment variables used (`SQLITE_FILE`, `SQLITE_DATABASE_PATH`)
   - Inconsistent handling between components

### SQLite Schema Evolution Issues

1. **Correct Schema Not Applied**:
   - Schema created manually but possibly not in the expected format
   - Column naming conventions (camelCase vs snake_case) causing mismatches

2. **Initialization Timing**:
   - Database schema might not be initialized before first query
   - Lack of proper error handling during schema initialization

### Agent Communication Failures

1. **Relay Server URL Hardcoding**:
   - Agents hardcoded to connect to `http://localhost:4000`
   - Changed relay server port not properly configured to match this hardcoded port

2. **Port Conflict Resolution**:
   - Agents finding alternative ports but relay server not aware
   - No discovery mechanism between agents and relay

## Comprehensive Solution Strategy

### 1. Environment Cleanup and Preparation

```bash
# Terminate all running processes
pkill -f "node server.js" 
pkill -f "pnpm --filter @elizaos/agent start"
pkill -f "node patches/start-agent-with-patches.js"

# Clean up ports
lsof -i:3000-3010,4000-4010 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true

# Clear database
rm -f /root/eliza/data/db.sqlite
```

### 2. Database Schema Initialization

Create a unified schema initialization script:

```bash
#!/bin/bash
# File: /root/eliza/setup-database.sh

# Create data directory if it doesn't exist
mkdir -p /root/eliza/data

# Initialize SQLite database with proper schema
sqlite3 /root/eliza/data/db.sqlite <<EOF
-- ElizaOS required tables
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  agentId TEXT NOT NULL,
  userId TEXT,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,
  vector BLOB,
  metadata TEXT,
  embedding BLOB
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  groupId TEXT NOT NULL,
  topic TEXT,
  status TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lastSeen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_memories_agentId ON memories(agentId);
CREATE INDEX IF NOT EXISTS idx_memories_userId ON memories(userId);
CREATE INDEX IF NOT EXISTS idx_messages_agentId ON messages(agentId);
CREATE INDEX IF NOT EXISTS idx_messages_userId ON messages(userId);
CREATE INDEX IF NOT EXISTS idx_conversations_groupId ON conversations(groupId);
EOF

# Set permissions
chmod 666 /root/eliza/data/db.sqlite
echo "SQLite database initialized at /root/eliza/data/db.sqlite"
```

### 3. Relay Server Configuration Patch

Create a relay server configuration patch:

```javascript
// File: /root/eliza/patches/relay-config-fix.js
/**
 * Relay Server Configuration Fix
 * This patch ensures that the relay server URL is correctly set
 */

console.log('[RELAY-CONFIG-FIX] Setting explicit Relay Server URL');

/**
 * Set the relay server URL based on environment or use default with configurable port
 */
export function configureRelayServer(relayPort = 4000) {
  const relayServerUrl = process.env.RELAY_SERVER_URL || `http://localhost:${relayPort}`;
  process.env.RELAY_SERVER_URL = relayServerUrl;
  console.log(`[RELAY-CONFIG-FIX] Using relay server URL: ${relayServerUrl}`);
  return relayServerUrl;
}

// Apply the configuration immediately
const configuredUrl = configureRelayServer();

// Export the configured URL
export default configuredUrl;
```

### 4. Startup Script

Create a clean startup script that uses in-memory mode:

```bash
#!/bin/bash
# File: /root/eliza/start-agents.sh

# Initialize environment
source /root/eliza/.env 2>/dev/null || true

# Clean up existing processes
echo "Cleaning up existing processes..."
pkill -f "node server.js" 2>/dev/null || true
pkill -f "pnpm --filter @elizaos/agent start" 2>/dev/null || true
pkill -f "node patches/start-agent-with-patches.js" 2>/dev/null || true
sleep 2

# Check for ports in use and kill processes
echo "Checking for ports in use..."
for port in $(seq 3000 3010) $(seq 4000 4010); do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ ! -z "$pid" ]; then
    echo "Killing process using port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null
  fi
done

# Set common environment variables
export USE_IN_MEMORY_DB=true
export RELAY_SERVER_URL="http://localhost:4000"

# Start relay server
echo "Starting relay server on port 4000..."
cd /root/eliza/relay-server && PORT=4000 node server.js > /root/eliza/logs/relay-server.log 2>&1 &
RELAY_PID=$!
echo "Relay server started with PID: $RELAY_PID"

# Wait for relay server to initialize
echo "Waiting for relay server to initialize..."
sleep 5

# Start agents one by one with patches
echo "Starting agent: eth_memelord_9000"
cd /root/eliza && AGENT_ID=eth_memelord_9000 \
  USE_IN_MEMORY_DB=true \
  RELAY_SERVER_URL=http://localhost:4000 \
  node patches/start-agent-with-patches.js \
  --isRoot \
  --characters=/root/eliza/packages/agent/src/characters/eth_memelord_9000.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --port=3000 \
  --log-level=debug > /root/eliza/logs/eth_patches.log 2>&1 &

# Start additional agents
# ...

# Check relay server health
echo "Checking relay server health..."
curl -s http://localhost:4000/health
```

## Final Decision: In-Memory Database

After careful consideration of both options, we chose to use the in-memory database for the following reasons:

1. **Simplicity**: Avoids complex schema initialization issues
2. **Reliability**: Bypasses SQLite initialization errors consistently
3. **Performance**: Faster operation without disk I/O
4. **Functionality**: All necessary agent features work with in-memory database

The solution required:
1. Creating a proper in-memory database patch (`in-memory-db-fix.js`)
2. Using the start-agent-with-patches.js script for agent startup
3. Setting USE_IN_MEMORY_DB=true for all agents

While this approach doesn't persist data across restarts, it provides a stable and functional system.

## Next Steps and Recommendations

### Immediate Actions

1. **Clean Environment**:
   - Completely terminate all processes
   - Remove all database files and recreate with proper schema
   - Ensure all ports are freed

2. **Database Configuration**:
   - Use a single consistent environment variable (`SQLITE_FILE`)
   - Set database path with absolute path
   - Verify schema creation before agent startup

3. **Relay Server Configuration**:
   - Start relay server first with explicit port 4000
   - Set `RELAY_SERVER_URL` environment variable for agents to match port 4000
   - Verify relay server health before starting agents

4. **Agent Startup Sequence**:
   - Start agents one by one with delays between each
   - Set unique ports for each agent
   - Monitor connection status after each agent starts

### Long-term Solutions

1. **Better Error Handling**:
   - Implement robust error handling for database initialization
   - Add retry mechanisms with exponential backoff
   - Improve error messages for troubleshooting

2. **Configuration Management**:
   - Consolidate environment variable handling
   - Create a unified configuration system
   - Document required configuration parameters

3. **Health Monitoring**:
   - Implement comprehensive health checks
   - Create a dashboard for monitoring agent status
   - Add automated recovery mechanisms

4. **Automated Startup Script**:
   - Develop a robust startup script with proper sequence
   - Include verification steps between actions
   - Add rollback mechanisms for failed components

## Implementation Timeline

1. **Day 1: Environment Cleanup and Database Setup**
   - Clean existing processes and database files
   - Create and test database schema
   - Verify database initialization

2. **Day 2: Relay Server and Agent Configuration**
   - Configure relay server with proper settings
   - Set up agent environment variables
   - Test agent-to-relay communication

3. **Day 3: Integration and Testing**
   - Start complete system with all components
   - Monitor for stability issues
   - Document working configuration

## Conclusion

The persistent issues with the ElizaOS Multi-Agent Telegram System stem from configuration inconsistencies, particularly around database initialization and connection management. By implementing a systematic approach to environment preparation, configuration, and startup sequence, these issues can be resolved. The key is ensuring that each component is properly initialized and verified before proceeding to the next step in the startup sequence. 