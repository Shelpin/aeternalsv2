# Comprehensive Debug Report: Agent-Relay Connection Issues

## Executive Summary
This report documents the complete debugging process for reconnecting ElizaOS agents to the Telegram relay server. The primary issues identified were:

1. **Authentication Token Mismatch**: Relay server expected `RELAY_API_KEY` while agents used `RELAY_AUTH_TOKEN`
2. **SQLite Adapter Missing**: Agent failed to find the SQLite adapter module
3. **Database Table Missing**: "memories" table not found despite initialization
4. **Port Configuration Error**: Agents started on wrong ports (3010-3012) instead of 3000

## 1. SQLite Adapter Identification and Build

### Located the adapter-sqlite package
```
$ find /root/eliza/packages -name "adapter-sqlite" -type d
/root/eliza/packages/adapter-sqlite
```

### Examined package directory contents
```
Contents of directory:
[dir]  node_modules/ (? items) - Mar 29, 12:05 PM
[file] .npmignore (52B, 6 lines) - Mar 05, 12:24 PM
[file] README.md (3.6KB, 178 lines) - Mar 05, 12:24 PM
[dir]  __tests__/ (? items) - Mar 05, 12:24 PM
[file] package.json (1.2KB, 47 lines) - Mar 05, 12:24 PM
[dir]  src/ (? items) - Mar 05, 12:24 PM
[file] tsconfig.json (182B, 10 lines) - Mar 05, 12:24 PM
[file] tsup.config.ts (637B, 23 lines) - Mar 05, 12:24 PM
[file] vitest.config.ts (152B, 9 lines) - Mar 05, 12:24 PM
```

### Built the SQLite adapter package
```
$ cd /root/eliza && pnpm --filter @elizaos-plugins/adapter-sqlite build

> @elizaos-plugins/adapter-sqlite@0.25.9 build /root/eliza/packages/adapter-sqlite
> tsup --format esm --dts

CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.3.5
CLI Using tsup config: /root/eliza/packages/adapter-sqlite/tsup.config.ts
CLI Target: esnext
CLI Cleaning output folder
ESM Build start
ESM dist/index.js     32.20 KB
ESM dist/index.js.map 63.18 KB
ESM ⚡️ Build success in 47ms
DTS Build start
DTS ⚡️ Build success in 9713ms
DTS dist/index.d.ts 10.55 KB
```

### Verified build output
```
Contents of directory: packages/adapter-sqlite/dist
[file] index.d.ts (11KB, 153 lines) - Mar 29, 04:26 PM
[file] index.js.map (63KB, 1 lines) - Mar 29, 04:26 PM
[file] index.js (32KB, 980 lines) - Mar 29, 04:26 PM
```

### Checked node_modules symlink
```
$ cd /root/eliza && ls -l node_modules/@elizaos-plugins/adapter-sqlite
lrwxrwxrwx 1 root root 29 Mar 29 13:05 node_modules/@elizaos-plugins/adapter-sqlite -> ../../packages/adapter-sqlite
```

## 2. Relay Server Authentication Fix

### Identified auth token issue in server code
```
$ grep -r "RELAY_AUTH_KEY" /root/eliza/relay-server/
```
No results found

### Found API key configuration
```
$ grep_search for "AUTH_KEY" in relay-server/**/*
No matches found
```

### Searched extensively for auth variables
```
$ grep -A 5 "relay" /tmp/agent_logs/agent_fixed3.log | head -n 30
[CONFIG] Using default relay server: http://207.180.245.243:4000
[CONFIG] Using default auth token: elizao****
```

### Located the API key in server.js
```
$ grep_search for "RELAY_AUTH|API_KEY" in relay-server/server.js
Line 19: const RELAY_API_KEY = process.env.RELAY_API_KEY || 'elizaos-secure-relay-key';
Line 20: logWithTime(`🔑 Using relay API key: ${RELAY_API_KEY.substring(0, 5)}****`);
Line 28: if (token === RELAY_API_KEY) {
Line 34: if (req.body && req.body.token === RELAY_API_KEY) {
Line 79: logWithTime(`🔍 Expected key: ${RELAY_API_KEY.substring(0, 5)}****`);
Line 86: logWithTime(`🔍 Token match: ${token === RELAY_API_KEY}`);
Line 93: logWithTime(`🔍 Body token match: ${req.body.token === RELAY_API_KEY}`);
```

### Modified server.js to accept RELAY_AUTH_TOKEN
```diff
// Load API key from environment variable
- const RELAY_API_KEY = process.env.RELAY_API_KEY || 'elizaos-secure-relay-key';
+ const RELAY_API_KEY = process.env.RELAY_AUTH_TOKEN || process.env.RELAY_API_KEY || 'elizaos-secure-relay-key';
logWithTime(`🔑 Using relay API key: ${RELAY_API_KEY.substring(0, 5)}****`);
```

### Restarted the relay server
```
$ cd /root/eliza/relay-server && node server.js &
[1] 1228948
[2025-03-29T16:38:59.967Z] 🔑 Using relay API key: eliza****
[2025-03-29T16:38:59.978Z] 🚀 Telegram Relay Server running on port 4000
[2025-03-29T16:38:59.979Z] 📝 Available endpoints:
[2025-03-29T16:38:59.979Z]   POST /register - Register an agent
[2025-03-29T16:38:59.979Z]   POST /unregister - Unregister an agent
[2025-03-29T16:38:59.979Z]   POST /heartbeat - Send a heartbeat
[2025-03-29T16:38:59.979Z]   GET /getUpdates - Get updates for an agent
[2025-03-29T16:38:59.980Z]   POST /sendMessage - Send a message
[2025-03-29T16:38:59.980Z]   POST /sendChatAction - Send a chat action
[2025-03-29T16:38:59.980Z]   GET /health - Health check
[2025-03-29T16:38:59.981Z]   GET /ping - Simple ping endpoint
```

## 3. Database Initialization and Setup

### Ran the database initialization script
```
$ node init_database.js
[DB INIT] Database initialization script starting...
[DB INIT] Initializing database: ./packages/agent/data/telegram-multiagent.db
[DB INIT] Created 'memories' table in ./packages/agent/data/telegram-multiagent.db
[DB INIT] Created index on agent_id in ./packages/agent/data/telegram-multiagent.db
[DB INIT] Created index on type in ./packages/agent/data/telegram-multiagent.db
[DB INIT] Created 'conversations' table in ./packages/agent/data/telegram-multiagent.db
[DB INIT] Created 'messages' table in ./packages/agent/data/telegram-multiagent.db
[DB INIT] Successfully initialized database: ./packages/agent/data/telegram-multiagent.db
[DB INIT] Initializing database: ./packages/telegram-multiagent/test_memory.db
[DB INIT] Created 'memories' table in ./packages/telegram-multiagent/test_memory.db
[DB INIT] Created index on agent_id in ./packages/telegram-multiagent/test_memory.db
[DB INIT] Created index on type in ./packages/telegram-multiagent/test_memory.db
[DB INIT] Created 'conversations' table in ./packages/telegram-multiagent/test_memory.db
[DB INIT] Created 'messages' table in ./packages/telegram-multiagent/test_memory.db
[DB INIT] Successfully initialized database: ./packages/telegram-multiagent/test_memory.db
[DB INIT] Database initialization complete!
```

### Located all SQLite database files
```
$ find /root/eliza -name "*.db" -type f | grep -v node_modules
/root/eliza/packages/telegram-multiagent/test_memory.db
/root/eliza/packages/agent/data/telegram-multiagent.db
/root/eliza/agent/data/telegram-multiagent.db
```

### Created backup of database in legacy location
```
$ cd /root/eliza && mkdir -p agent/data && cp packages/agent/data/telegram-multiagent.db agent/data/
```

## 4. Agent Run Attempts

### Attempt 1: Basic Configuration (Port 3010)
```
$ cd /root/eliza && RELAY_SERVER_URL="http://localhost:4000" RELAY_AUTH_TOKEN="elizaos-secure-relay-key" DISABLE_POLLING=false TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN_ETHMemeLord9000" DEBUG=elizaos:* pnpm --filter @elizaos/agent start --isRoot --character="/root/eliza/characters/eth_memelord_9000.json" --clients=@elizaos/client-telegram --plugins=@elizaos/telegram-multiagent --log-level=debug --port=3010 > /tmp/agent_logs/agent_fixed.log 2>&1 &
[2] 1229036
```

#### Health check after 15 seconds
```
$ sleep 15 && curl http://localhost:4000/health
[2025-03-29T16:39:35.939Z] ℹ️ Health check - Agents online: 0
{"status":"ok","agents":0,"agents_list":[],"agents_details":[],"uptime":36.241760283,"timestamp":"2025-03-29T16:39:35.939Z","version":"1.1.0-valhalla"}
```

#### Error logs from agent
```
$ grep -E "relay|connect|ERROR" /tmp/agent_logs/agent_fixed.log | head -n 30
[CONFIG] Using default relay server: http://207.180.245.243:4000
  'relay',               'kickstarters',
[ERROR] TelegramMultiAgentPlugin: [PLUGIN] Failed to initialize Telegram client: TelegramClient not found in any of the expected locations
[ERROR] TelegramMultiAgentPlugin: [PLUGIN] Will try to create minimal client
```

### Attempt 2: With Explicit DB Path (Port 3011)
```
$ cd /root/eliza && RELAY_SERVER_URL="http://localhost:4000" RELAY_AUTH_TOKEN="elizaos-secure-relay-key" DISABLE_POLLING=false SQLITE_DB_PATH="/root/eliza/agent/data/telegram-multiagent.db" TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN_ETHMemeLord9000" DEBUG=elizaos:* pnpm --filter @elizaos/agent start --isRoot --character="/root/eliza/characters/eth_memelord_9000.json" --clients=@elizaos/client-telegram --plugins=@elizaos/telegram-multiagent --log-level=debug --port=3011 > /tmp/agent_logs/agent_fixed2.log 2>&1 &
[1] 1229959
```

#### Health check after 15 seconds
```
$ sleep 15 && curl http://localhost:4000/health
{"status":"ok","agents":0,"agents_list":[],"agents_details":[],"uptime":147.856705302,"timestamp":"2025-03-29T16:41:27.554Z","version":"1.1.0-valhalla"}
```

### Attempt 3: With Additional Debug Flags (Port 3012)
```
$ cd /root/eliza && RELAY_SERVER_URL="http://localhost:4000" RELAY_AUTH_TOKEN="elizaos-secure-relay-key" DISABLE_POLLING=false SQLITE_DB_PATH="/root/eliza/agent/data/telegram-multiagent.db" TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN_ETHMemeLord9000" DEBUG=elizaos:*,valhalla:* NODE_DEBUG=TelegramMultiAgentPlugin,eliza pnpm --filter @elizaos/agent start --isRoot --character="/root/eliza/characters/eth_memelord_9000.json" --clients=@elizaos/client-telegram --plugins=@elizaos/telegram-multiagent --log-level=debug --port=3012 > /tmp/agent_logs/agent_fixed3.log 2>&1 &
[2] 1231070
```

#### Health check after 15 seconds
```
$ sleep 15 && curl http://localhost:4000/health
{"status":"ok","agents":0,"agents_list":[],"agents_details":[],"uptime":265.972066147,"timestamp":"2025-03-29T16:43:25.670Z","version":"1.1.0-valhalla"}
```

#### Error logs from agent
```
$ tail -n 100 /tmp/agent_logs/agent_fixed3.log | grep -i error
[ERROR] TelegramMultiAgentPlugin: [PLUGIN] Failed to initialize Telegram client: TelegramClient not found in any of the expected locations
[ERROR] TelegramMultiAgentPlugin: [PLUGIN] Will try to create minimal client
```

## 5. SQLite Dependencies Installation

### Added SQLite to workspace root
```
$ cd /root/eliza && REGISTRY_DISABLE=true pnpm add -w better-sqlite3@11.9.1
 WARN  deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
 WARN  8 deprecated subdependencies found: @humanwhocodes/config-array@0.13.0, @humanwhocodes/object-schema@2.0.3, ethereumjs-abi@0.6.8, glob@7.2.3, inflight@1.0.6, rimraf@3.0.2, unicode-9.0.0@0.7.0, yaeti@0.0.6
Already up to date
Progress: resolved 1261, reused 1181, downloaded 3, added 0, done
```

### Installed additional SQLite packages
```
$ cd /root/eliza && pnpm install -w sqlite@5.0.1 sqlite3@5.1.6
 WARN  deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
 WARN  15 deprecated subdependencies found: @humanwhocodes/config-array@0.13.0, @humanwhocodes/object-schema@2.0.3, @npmcli/move-file@1.1.2, are-we-there-yet@2.0.0, are-we-there-yet@3.0.1, ethereumjs-abi@0.6.8, gauge@3.0.2, gauge@4.0.4, glob@7.2.3, inflight@1.0.6, npmlog@5.0.1, npmlog@6.0.2, rimraf@3.0.2, unicode-9.0.0@0.7.0, yaeti@0.0.6
Packages: +33
+++++++++++++++++++++++++++++++++
Progress: resolved 1294, reused 1209, downloaded 8, added 8, done
node_modules/.pnpm/sqlite3@5.1.6_encoding@0.1.13/node_modules/sqlite3: Running install script, done in 1.3s

dependencies:
+ sqlite 5.0.1 (5.1.1 is available)
+ sqlite3 5.1.6 (5.1.7 is available)
```

## 6. Plugin Code Analysis

### Found how relay server URL is handled
```
$ grep_search for "RELAY_SERVER_URL" in packages/telegram-multiagent/src/TelegramMultiAgentPlugin.ts
Line 242: RELAY_SERVER_URL=${process.env.RELAY_SERVER_URL || 'not set'}
Line 249: if (process.env.RELAY_SERVER_URL) {
Line 250: this.logger.info(`${this.name}: Using relay server URL from environment: ${process.env.RELAY_SERVER_URL}`);
Line 251: this.config.relayServerUrl = process.env.RELAY_SERVER_URL;
Line 310: if (process.env.RELAY_SERVER_URL) {
```

### Added enhanced debugging to plugin
```diff
// Log environment variables for debugging
this.logger.debug(`${this.name}: [DEBUG] Environment RELAY_SERVER_URL=${process.env.RELAY_SERVER_URL || 'not set'}`);
this.logger.debug(`${this.name}: [DEBUG] Environment RELAY_AUTH_TOKEN=${process.env.RELAY_AUTH_TOKEN ? '(set)' : 'not set'}`);
this.logger.debug(`${this.name}: [DEBUG] Environment RELAY_API_KEY=${process.env.RELAY_API_KEY ? '(set)' : 'not set'}`);
this.logger.debug(`${this.name}: [DEBUG] Environment RELAY_AUTH_KEY=${process.env.RELAY_AUTH_KEY ? '(set)' : 'not set'}`);
this.logger.debug(`${this.name}: [DEBUG] Environment DISABLE_POLLING=${process.env.DISABLE_POLLING || 'not set'}`);

// Setup relay server URL and authentication token
if (process.env.RELAY_SERVER_URL) {
  this.logger.info(`${this.name}: Using relay server URL from environment: ${process.env.RELAY_SERVER_URL}`);
  this.config.relayServerUrl = process.env.RELAY_SERVER_URL;
} else {
  this.logger.warn(`${this.name}: RELAY_SERVER_URL not set in environment. Using default: ${this.config.relayServerUrl}`);
}
```

### Started building the plugin
```
$ cd /root/eliza && pnpm --filter @elizaos/telegram-multiagent build

> @elizaos/telegram-multiagent@0.1.0 build /root/eliza/packages/telegram-multiagent
> npm run clean && npm run build:esm && npm run build:types


> @elizaos/telegram-multiagent@0.1.0 clean
> rimraf dist


> @elizaos/telegram-multiagent@0.1.0 build:esm
> esbuild src/index.ts --bundle --platform=node --target=node16 --format=esm --outfile=dist/index.js --external:@elizaos/core --external:better-sqlite3 --external:sqlite --external:sqlite3 --external:uuid


  dist/index.js  2.2mb ⚡️

⚡ Done in 325ms

> @elizaos/telegram-multiagent@0.1.0 build:types
> tsc --emitDeclarationOnly --skipLibCheck
```

## 7. Key Issues & Root Causes

### 1. Authentication Token Mismatch
- **Root Cause**: The relay server was looking for `RELAY_API_KEY` but the agent was sending `RELAY_AUTH_TOKEN`
- **Fix**: Modified the relay server to accept either token name

### 2. SQLite Adapter Missing
- **Root Cause**: The adapter package existed but wasn't properly built
- **Fix**: Built the adapter package and installed additional SQLite dependencies

### 3. Database Issues
- **Root Cause**: Database created but possibly not in the expected location
- **Fix**: Copied database to both locations and explicitly set `SQLITE_DB_PATH`

### 4. Port Configuration Error
- **Root Cause**: Agents were started on ports 3010-3012 instead of the expected port 3000
- **Fix**: None implemented yet, should restart with port 3000

### 5. Hard-coded Relay URL
- **Root Cause**: `TelegramMultiAgentPlugin.ts` has a hardcoded default `relayServerUrl: 'http://207.180.245.243:4000'`
- **Fix**: Enhanced logging to track the issue but no complete fix implemented

## 8. Remaining Issues

1. **Agents not registering**: Despite all fixes, agents still don't register with the relay server
   - Health check consistently shows 0 agents
   - No registerAgent logging seen in agent logs

2. **Telegram Client Initialization Failure**:
   ```
   [ERROR] TelegramMultiAgentPlugin: [PLUGIN] Failed to initialize Telegram client: TelegramClient not found in any of the expected locations
   [ERROR] TelegramMultiAgentPlugin: [PLUGIN] Will try to create minimal client
   ```

3. **Default relay URL still used**:
   ```
   [CONFIG] Using default relay server: http://207.180.245.243:4000
   ```

## 9. Next Steps

1. **Use Correct Port**: Restart agent with port 3000 to match relay server expectations
2. **Fix Hard-coded URLs**: Update default URLs in the plugin source code
3. **Debug Telegram Client**: Investigate client initialization failure
4. **Capture Verbose Logs**: Set up more detailed logging during startup
5. **Simplify Test Case**: Create a minimal test case to isolate the relay server connection issue 