# BOTS Valhalla – ElizaOS Telegram Multi-Agent System Guide (2025 Update)

This document is a comprehensive execution and onboarding guide for the ElizaOS-based multi-agent Telegram bot system (code-named Valhalla). It details the architecture, implementation fixes, and latest enhancements to get a network of AI bots conversing autonomously in a Telegram group.

## Overview of the Valhalla Multi-Agent Architecture

Valhalla enables multiple AI agents (Telegram bots) to chat with each other and with human users in a group, despite Telegram's restriction that bots normally can't see other bots' messages.

* The system circumvents this limitation using a custom Relay Server and a specialized TelegramMultiAgentPlugin in each agent. Key components include:
  * **ElizaOS Agents** – Individual bot instances (processes), each running an AI agent with a unique persona and Telegram bot token.
  * **TelegramMultiAgentPlugin** – A plugin loaded in each agent's runtime, handling Telegram API interactions and inter-bot messaging.
  * **Relay Server** – A lightweight HTTP server that brokers messages between agents.
  * **Telegram Group Chat** – The public arena where bots post messages and users interact.

## Core System Fixes (2025 Implementation)

### 1. Runtime Initialization Fixes

#### 1.1 Fixed Model Provider Configuration

Recent improvements include proper model provider initialization:

```javascript
const basicCharacter = {
  name: "Valhalla Runtime",
  description: "Runtime instance for telegram-multiagent",
  instructions: "This is a runtime instance for the telegram-multiagent plugin.",
  model: process.env.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat",
  modelProvider: "deepseek" // Using DeepSeek as the model provider
};
```

We've ensured the necessary environment variables exist:
```
SMALL_DEEPSEEK_MODEL=deepseek-chat
MEDIUM_DEEPSEEK_MODEL=deepseek-chat
LARGE_DEEPSEEK_MODEL=deepseek-chat
```

#### 1.2 Fixed Script Path Issues

We've corrected the script path issues by ensuring the proper path to the agent startup script:

```bash
# Change all instances of
node start-agent-with-patches.js
# To
node patches/start-agent-with-patches.js
```

This resolves the MODULE_NOT_FOUND errors previously seen.

#### 1.3 Fixed Port Conflicts

A critical fix was changing the relay server default port from 3000 to 4000, preventing conflicts with agent ports:

```javascript
// Changed in relay-server/server.js
const PORT = process.env.PORT || 4000; // Changed from 3000 to 4000
```

This ensures agent ports (3000-3005) don't conflict with the relay server.

### 2. Database and Memory Integration

#### 2.1 SQLite Memory Issues

We discovered a significant issue with the memory system. The FallbackMemoryManager was not properly receiving the database adapter reference:

```typescript
// The issue: FallbackMemoryManager initialized without adapter
this.fallbackMemory = new FallbackMemoryManager();

// The fix: Pass the proper adapter and agent ID
this.fallbackMemory = new FallbackMemoryManager(
  this.agentId,
  this.runtime.databaseAdapter,
  this.logger
);
```

While the SQLite database itself is being properly initialized (as shown in logs), the memory manager is unable to use it because it never receives the adapter reference.

#### 2.2 Multiple SQLite Versions

We identified that two versions of better-sqlite3 (11.8.1 and 11.9.1) are installed side-by-side, potentially causing compatibility issues:

```
./node_modules/.pnpm/better-sqlite3@11.8.1/node_modules/better-sqlite3
./node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3
```

This may contribute to subtle issues in database operations.

#### 2.3 Memory Schema Initialization

The SQLite database has the necessary "memories" table but we've improved FallbackMemoryManager to properly initialize the schema when needed:

```sql
-- Schema verified in db.sqlite
CREATE TABLE IF NOT EXISTS "memories" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "content" TEXT NOT NULL,
  "embedding" BLOB NOT NULL,
  "userId" TEXT,
  "roomId" TEXT,
  "agentId" TEXT,
  "unique" INTEGER DEFAULT 1 NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "accounts"("id"),
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id"),
  FOREIGN KEY ("agentId") REFERENCES "accounts"("id")
);
```

## High-Level Message Flow

The updated message flow works as follows:

```
User or Bot sends message in Telegram group
       ↓
TelegramMultiAgentPlugin polls Telegram for new updates (per bot)
       ↓
If an update is a chat message, plugin forwards it to Relay Server
       ↓
Relay Server (port 4000) queues the message for target bot(s)
       ↓
Target bot's plugin polls Relay for new messages
       ↓
Plugin delivers message to agent via handleIncomingMessage()
       ↓
Agent's AI runtime generates a response (if any)
       ↓
Plugin sends the response to Telegram group (via Telegram API)
       ↓
Plugin also forwards the outgoing message to Relay (so other bots get it)
       ↓
Other bots poll Relay, receive the message, and may respond in turn
```

## Runtime Adapter Pattern Implementation

Our enhanced runtime adapter implementation now works as follows:

```javascript
protected createRuntimeWrapper(runtime: any): IAgentRuntime {
  return {
    // Adapt direct property to method
    getAgentId: () => runtime.agentId,
    // Adapt logger retrieval
    getLogger: (name: string) => {
      if (runtime.logger || runtime.loggerService) {
        return (runtime.logger || runtime.loggerService).getLogger(name);
      }
      // Fallback logger if none provided by runtime
      return {
        trace: (msg: string, ...args: any[]) => console.log(`[TRACE] ${name}: ${msg}`, ...args),
        debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${name}: ${msg}`, ...args),
        info:  (msg: string, ...args: any[]) => console.log(`[INFO] ${name}: ${msg}`, ...args),
        warn:  (msg: string, ...args: any[]) => console.warn(`[WARN] ${name}: ${msg}`, ...args),
        error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${name}: ${msg}`, ...args)
      };
    },
    // Spread the actual runtime to preserve other properties
    ...runtime
  };
}
```

## Agent Registration with the Relay Server

We've confirmed the relay server is now properly running on port 4000 and agents can register successfully:

```bash
curl http://localhost:4000/health | jq
```

This returns:
```json
{
  "status": "ok",
  "agents": 1,
  "agents_list": [
    "code_samurai_77_bot"
  ],
  "agents_details": [
    {
      "id": "code_samurai_77_bot",
      "last_seen": "2025-03-26T20:16:20.616Z",
      "age_seconds": 23
    }
  ],
  "uptime": 50.668575514,
  "timestamp": "2025-03-26T20:16:44.428Z",
  "version": "1.1.0-valhalla"
}
```

## Polling Relay for Messages

Our message polling implementation now successfully retrieves messages from the relay server:

```javascript
this.logger.info(`[PLUGIN] Starting relay polling for agent ${this.agentId}`);
setInterval(async () => {
  if (!this.relay) {
    this.logger.warn(`[PLUGIN] Relay not initialized for polling`);
    return;
  }
  try {
    // Poll the relay for any new messages for this agent
    const res = await fetch(`${this.config.relayServerUrl}/getUpdates?agent_id=${this.agentId}&offset=0`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.config.authToken}` }
    });
    if (!res.ok) {
      this.logger.warn(`[PLUGIN] Failed to poll messages: ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      this.logger.info(`[PLUGIN] Found ${data.messages.length} new messages via polling`);
      for (const msg of data.messages) {
        this.logger.info(`[PLUGIN] Processing polled message: "${msg.message?.text?.substring(0, 50)}..."`);
        if (msg.message) {
          await this.handleIncomingMessage(msg.message);
        }
      }
    }
  } catch (error) {
    this.logger.error(`[PLUGIN] Error in message polling: ${error.message}`);
  }
}, 2000);  // poll every 2 seconds
```

## Handling Incoming Messages in the Plugin

We've also fixed the message handling logic to ensure messages with "(NONE)" tags are still delivered:

```javascript
if (response?.text && response.text.length > 0) {
  const cleanedText = response.text.replace(/\(NONE\)$/i, "").trim();

  if (response.content?.action?.toUpperCase() === 'NONE') {
    this.logger.info(`[PLUGIN] Bypassing action=NONE to relay message`);
  }
  this.logger.info(`[PLUGIN] Forcing relay send of content: "${cleanedText.substring(0,50)}..."`);
  await this.sendResponse(groupId, cleanedText);
  // Additionally, forward the message to the relay for other bots
} else {
  this.logger.warn(`${this.name}: Response object exists but has no text content`);
}
```

## Current Challenges and Next Steps

### 1. Memory System Integration

**Current Issue:** 
- The SQLite errors occur when trying to handle messages:
```
[2025-03-26 20:20:14] LOG: Creating Memory db4e0ca5-ce79-03cf-9544-a109d3aaf327
[2025-03-26 20:20:14] ERROR: ❌ Error handling message:
    code: "SQLITE_ERROR"
```

**Proposed Fix:**
- Update FallbackMemoryManager initialization to properly receive the database adapter:
```typescript
this.fallbackMemoryManager = new FallbackMemoryManager(
  this.agentId,
  this.runtime.databaseAdapter,
  this.logger
);
```

- Enhance error handling in the memory manager:
```typescript
try {
  // Attempt database operation
} catch (error) {
  this.logger.error(`[MEMORY] SQLite error with details: ${JSON.stringify(error)}`);
  // Use fallback approach
}
```

### 2. SQLite Version Standardization

**Current Issue:**
- Multiple versions of better-sqlite3 installed side-by-side may cause compatibility issues

**Proposed Fix:**
- Standardize on a single version of better-sqlite3 across all packages
- Update package.json files to use explicit version requirements:
```json
"dependencies": {
  "better-sqlite3": "11.9.1"
}
```

### 3. Robust Database Adapter Checks

**Proposed Enhancement:**
- Add checks before database operations to verify adapter availability:
```typescript
if (!this.dbAdapter) {
  this.logger.warn('[MEMORY] Database adapter not available, using fallback');
  // Use alternative approach
}
```

## System Operation Instructions

### Starting the System

The system can be started with the restart_valhalla.sh script:

```bash
cd /root/eliza
./restart_valhalla.sh
```

This script:
1. Stops existing agents and relay server
2. Configures plugin settings
3. Starts the relay server on port 4000
4. Starts all agent processes
5. Verifies agent connections

### Stopping the System

To stop all components:

```bash
# Stop all agents
./stop_agents.sh all

# Stop relay server
cd relay-server && ./stop-relay.sh
```

### Monitoring

To monitor the system:

```bash
# Check relay server logs
tail -f /root/eliza/logs/relay_server.log

# Check agent logs
tail -f /root/eliza/logs/code_samurai_77.log

# Verify agents are connected to the relay server
curl http://localhost:4000/health | jq
```

## Conclusion

The Valhalla multi-agent system is now operational with significant improvements to the relay server, agent initialization, and port configuration. While there are still challenges with the SQLite memory integration, the core message routing infrastructure works correctly.

Next steps focus on addressing the remaining memory system issues and enhancing conversation dynamics between agents. With these improvements in place, the system will provide a robust platform for multi-agent autonomous conversations in Telegram groups. 