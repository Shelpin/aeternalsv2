# ElizaOS Multi-Agent Telegram System Fix Plan - 2025-03-26

## 1. Core Issues Identified

Based on the logs and error analysis, we've identified four critical issues that must be fixed:

1. **Runtime Initialization Failure**: `Invalid model provider: undefined`
2. **Incorrect Script Path**: Using `/root/eliza/start-agent-with-patches.js` instead of `/root/eliza/patches/start-agent-with-patches.js`
3. **Port Conflicts**: Relay server running on port 3000 instead of port 4000
4. **SQLite Errors**: Database initialization or access errors

## 2. Implementation Fix Plan

### 2.1 Fix Model Provider Configuration

The immediate error is `Invalid model provider: undefined` in the runtime-patch.js file. Looking at the code, we identified:

```javascript
// Create a basic character config for runtime initialization
const basicCharacter = {
  name: "Valhalla Runtime",
  description: "Runtime instance for telegram-multiagent",
  instructions: "This is a runtime instance for the telegram-multiagent plugin.",
  model: process.env.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat",
  modelProvider: "deepseek" // Using DeepSeek as the model provider
};
```

The environment variables are missing MEDIUM_DEEPSEEK_MODEL and other required variables. We need to:

1. Add missing environment variables:
```
SMALL_DEEPSEEK_MODEL=deepseek-chat
MEDIUM_DEEPSEEK_MODEL=deepseek-chat
LARGE_DEEPSEEK_MODEL=deepseek-chat
```

2. Ensure each character file has a modelProvider field set (they do, but we need to double-check)

### 2.2 Fix Script Path Issues

The script `start-agent-with-patches.js` is located in `/root/eliza/patches/` directory, but all commands are trying to run it from `/root/eliza/`. We need to:

1. Update the specific commands that are failing with MODULE_NOT_FOUND errors to use the correct path:
```bash
# Replace
node start-agent-with-patches.js --port=3000 --character=code_samurai_77
# With
node patches/start-agent-with-patches.js --port=3000 --character=code_samurai_77
```

2. The `start_agents.sh` script is correctly using the patches/ path, but the individual commands run from the command line are not.

### 2.3 Fix Port Conflicts

After examining the relay server code in `server.js`, we found the issue is in the PORT fallback:

```javascript
// Start the server
const PORT = process.env.PORT || 3000;
```

The relay server is correctly configured to use port 4000 in the scripts:
- `restart_valhalla.sh` sets `export PORT=$RELAY_PORT` (which is 4000)
- `relay-server/start-relay.sh` defaults to PORT=4000

However, the environment variable isn't being properly propagated to the Node.js process. We need to:

1. Directly modify the server.js file to use port 4000 by default:
```javascript
// Update in server.js
const PORT = process.env.PORT || 4000;
```

2. Ensure the PORT environment variable is properly exported and available to the child process:
```bash
# In restart_valhalla.sh, use explicit command-line parameter
node relay-server/server.js --port=4000
```

3. Or run the server with PORT explicitly set in the same command:
```bash
PORT=4000 node relay-server/server.js
```

### 2.4 Fix SQLite Errors

The SQLite errors are likely due to improper initialization. Our fix to the FallbackMemoryManager was technically correct but the agents aren't running due to the runtime initialization failure.

Once we fix the core runtime issue, we should:
1. Verify our FallbackMemoryManager implementation
2. Add proper error handling and diagnostic logging

## 3. Step-by-Step Implementation Plan

### Step 1: Fix Model Provider Configuration

1. Create a new .env entry for DeepSeek models:
```
SMALL_DEEPSEEK_MODEL=deepseek-chat
MEDIUM_DEEPSEEK_MODEL=deepseek-chat
LARGE_DEEPSEEK_MODEL=deepseek-chat
```

2. Update the runtime-patch.js file to more robustly handle missing environment variables:
```javascript
const basicCharacter = {
  name: "Valhalla Runtime",
  description: "Runtime instance for telegram-multiagent",
  instructions: "This is a runtime instance for the telegram-multiagent plugin.",
  model: process.env.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat",
  modelProvider: "deepseek"
};

// Log detailed diagnostic info
elizaLogger.info(`[PATCH] Environment variables: USE_OPENAI_EMBEDDING=${process.env.USE_OPENAI_EMBEDDING}`);
elizaLogger.info(`[PATCH] Environment variables: MEDIUM_DEEPSEEK_MODEL=${process.env.MEDIUM_DEEPSEEK_MODEL}`);
```

### Step 2: Fix Script Path Issues

1. When running agents manually, use the correct script path:
```bash
# Change all instances of
node start-agent-with-patches.js
# To
node patches/start-agent-with-patches.js
```

### Step 3: Fix Port Conflicts

1. Edit server.js to explicitly use port 4000 as the default:
```javascript
// Change in relay-server/server.js
const PORT = process.env.PORT || 4000;
```

2. Update the start command in restart_valhalla.sh to be more explicit:
```bash
# Option 1: Use PORT environment variable
export PORT=4000
node relay-server/server.js

# Option 2: Use PORT directly in command
PORT=4000 node relay-server/server.js
```

### Step 4: Test Individual Components

1. Test relay server in isolation:
```bash
cd /root/eliza
PORT=4000 node relay-server/server.js
```

2. Test single agent startup with correct path:
```bash
cd /root/eliza
node patches/start-agent-with-patches.js --port=3000 --character=code_samurai_77
```

3. Verify agent connects to relay:
```bash
curl http://localhost:4000/health
```

### Step 5: Complete System Integration

1. Run the restart_valhalla.sh script to apply all fixes:
```bash
cd /root/eliza
./restart_valhalla.sh
```

2. Monitor logs to verify all components are running correctly:
```bash
# Check relay server logs
tail -f /root/eliza/logs/relay_server.log

# Check agent logs
tail -f /root/eliza/logs/code_samurai_77.log
```

3. Verify agents are connected to the relay server:
```bash
curl http://localhost:4000/health | jq
```

4. To stop all components when needed:
```bash
# Stop all agents
./stop_agents.sh all

# Stop relay server
cd relay-server && ./stop-relay.sh
```

## 4. Key Questions for Implementation

1. Does the .env file need other variables for the runtime initialization?
2. Are there any missing dependencies in the package.json?
3. Are there any permission issues with the SQLite database files?
4. How many attempts should be made to reconnect to the relay server?

## 5. Expected Outcomes

After implementing these fixes, we expect:

1. All agents to properly initialize with a valid runtime
2. The relay server to run on port 4000, not conflicting with agents
3. Agents to successfully connect to the relay server
4. Messages to be properly logged in JSON format
5. The SQLite memory system to properly store and retrieve messages
6. Agents to respond to mentions in the Telegram group

## 6. Verification of Fixes

We have verified that:

1. The relay server now correctly runs on port 4000
2. At least one agent (code_samurai_77) can successfully connect to the relay server
3. The correct path for start-agent-with-patches.js is being used
4. The DeepSeek model variables are properly set in the .env file

The system is now operational, but we should continue monitoring for additional issues, particularly related to SQLite memory management and message handling. 