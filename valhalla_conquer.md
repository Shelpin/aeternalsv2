# 🏰 Valhalla Conquer: Complete Debugging Action Plan

This document outlines a comprehensive, phased approach to debug and resolve issues in the ElizaOS Valhalla multi-agent Telegram bot system. Each phase has clear success criteria and builds on previous phases to systematically restore functionality.

## 📋 Overview of Issues

Based on analysis of the codebase, we need to address:

1. **Runtime patching and initialization** - Ensure the ElizaOS runtime is properly patched with the Telegram client
2. **Relay server setup** - Ensure the relay server is running correctly to facilitate bot-to-bot communication
3. **Character file path resolution** - Ensure character files are found in the correct locations
4. **Agent startup configuration** - Ensure agents start with the correct environment variables and parameters
5. **In-memory database setup** - Ensure the database is properly configured to avoid SQLite errors
6. **Bot-to-bot communication** - Verify messages are properly relayed between agents

## 🧪 Phase 1: Environment Cleanup and Verification

### 1.1 System Reset
```bash
# Kill all existing processes - carefully target only ElizaOS related processes
# to avoid disrupting the cursor node processes that handle the connection to the remote machine
pkill -f "node server.js"
pkill -f "start-agent"
pkill -f "start-agent-with-patches"

# Clean all ports to avoid conflicts
for port in {3000..3010} 4000; do
  fuser -k $port/tcp 2>/dev/null || true
done

# Clean database files
rm -rf /root/eliza/data/*.sqlite /root/eliza/data/*.sqlite-shm /root/eliza/data/*.sqlite-wal
mkdir -p /root/eliza/data

# Clean log files for fresh start
mkdir -p /root/eliza/logs
rm -f /root/eliza/logs/*.log
touch /root/eliza/logs/debug.log
```

### 1.2 Dependency Verification
```bash
# Check Node.js version - ElizaOS requires Node.js 23+
node --version

# Verify ts-node installation
# Double check if using npm instead of pnpm can cause issues or mask them
npm ls ts-node -g
npm ls ts-node

# Check ElizaOS package availability
ls -la /root/eliza/packages/core/dist/
ls -la /root/eliza/packages/clients/telegram/
```

### 1.3 Character File Verification
```bash
# Ensure characters directory exists in correct location
mkdir -p /root/eliza/packages/agent/src/characters/

# Check if character files exist
ls -la /root/eliza/packages/agent/src/characters/*.json

# If not found, copy character files from alternative locations
if [ ! -f "/root/eliza/packages/agent/src/characters/bitcoin_maxi_420.json" ]; then
  cp /root/eliza/characters/*.json /root/eliza/packages/agent/src/characters/
  echo "Character files copied to target directory"
fi

# Ensure required character files exist
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  if [ ! -f "/root/eliza/packages/agent/src/characters/${agent}.json" ]; then
    echo "❌ Missing character file: ${agent}.json"
  else
    echo "✅ Found character file: ${agent}.json"
  fi
done
```

**Phase 1 Success Criteria:**
- All processes terminated ✅
- Ports cleaned ✅
- Node.js version is 23+ ✅
- Character files exist in correct location ✅

## 🧪 Phase 2: Runtime Patching and Validation

### 2.1 Apply Runtime Patches
```bash
cd /root/eliza
node patches/apply-patches.js > logs/patches.log 2>&1
```

### 2.2 Verify Runtime Patching
```bash
# Check patch logs for successful patching
grep -E "(Successfully|✅)" logs/patches.log

# Verify runtime object creation
grep "Created runtime" logs/patches.log

# Verify Telegram client injection
grep "telegram client" logs/patches.log

# Test runtime availability from Node.js
node -e "console.log('Runtime available globally:', !!globalThis.__elizaRuntime); console.log('Telegram client available:', !!globalThis.__elizaRuntime?.client?.telegram)" | tee -a logs/runtime_check.log
```

**Phase 2 Success Criteria:**
- Runtime patch applied without errors ✅
- Telegram client successfully injected ✅
- Runtime available globally ✅
- Runtime has handleMessage method available ✅

## 🧪 Phase 3: Relay Server Deployment

### 3.1 Start Relay Server
```bash
# Check if port 4000 is available
lsof -i:4000 || echo "Port 4000 is available"

# If port is in use, kill the process using it
lsof -i:4000 -t | xargs kill -9 2>/dev/null || true

# Start the relay server
cd /root/eliza/relay-server
PORT=4000 RELAY_AUTH_TOKEN="elizaos-secure-relay-key" node server.js > ../logs/relay-server.log 2>&1 &

# Wait for server to start
sleep 3
```

### 3.2 Verify Relay Server
```bash
# Check if relay server is running
curl http://localhost:4000/health | tee -a /root/eliza/logs/relay_health.log

# Verify server logs
tail -n 20 /root/eliza/logs/relay-server.log

# Test simple ping endpoint
curl http://localhost:4000/ping
```

**Phase 3 Success Criteria:**
- Relay server running on port 4000 ✅
- Health endpoint returns status "ok" ✅
- Server logs show successful startup ✅

## 🧪 Phase 4: Single Agent Deployment

### 4.1 Start First Agent (Bitcoin Maxi)
```bash
# Agent port order:
# eth_memelord_9000: port 3000
# bag_flipper_9000: port 3001
# linda_evangelista_88: port 3002
# vc_shark_99: port 3003
# bitcoin_maxi_420: port 3004
# code_samurai_77: port 3005

cd /root/eliza
export AGENT_ID=bitcoin_maxi_420
export USE_IN_MEMORY_DB=true
export RELAY_SERVER_URL=http://localhost:4000
export RELAY_AUTH_TOKEN="elizaos-secure-relay-key"
export TELEGRAM_GROUP_IDS="-1002550618173"
export TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420="${TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420}"
export FORCE_EXACT_PORT=true
export DISABLE_POLLING=false
export FORCE_GC=true

node patches/start-agent-with-patches.js --isRoot \
  --characters=/root/eliza/packages/agent/src/characters/bitcoin_maxi_420.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --port=3004 \
  --log-level=debug > /root/eliza/logs/bitcoin_maxi_420.log 2>&1 &

sleep 10
```

### 4.2 Verify Agent Health
```bash
# Check agent process is running
ps aux | grep "start-agent-with-patches" | grep -v grep

# Check agent port is active
curl http://localhost:3004/health | tee -a /root/eliza/logs/agent_health.log

# Check agent logs for successful initialization
grep -E "(Successfully|✅|Plugin fully initialized)" /root/eliza/logs/bitcoin_maxi_420.log

# Check if agent registered with relay
curl http://localhost:4000/health | tee -a /root/eliza/logs/relay_health_after_agent.log
```

**Phase 4 Success Criteria:**
- Agent process running ✅
- Agent health endpoint returns status "ok" ✅
- Agent successfully registered with relay server ✅
- Agent logs show "Plugin fully initialized" ✅

## 🧪 Phase 5: Multi-Agent Deployment

### 5.1 Start Additional Agents
```bash
# Function to start an agent
start_agent() {
  local agent_id=$1
  local port=$2
  
  echo "Starting agent: ${agent_id} on port ${port}"
  
  export AGENT_ID=${agent_id}
  export USE_IN_MEMORY_DB=true
  export RELAY_SERVER_URL=http://localhost:4000
  export RELAY_AUTH_TOKEN="elizaos-secure-relay-key"
  export TELEGRAM_GROUP_IDS="-1002550618173"
  export TELEGRAM_BOT_TOKEN_${agent_id^^}="${!TELEGRAM_BOT_TOKEN_${agent_id^^}}"
  export FORCE_EXACT_PORT=true
  export DISABLE_POLLING=false
  export FORCE_GC=true
  
  cd /root/eliza
  node patches/start-agent-with-patches.js --isRoot \
    --characters=/root/eliza/packages/agent/src/characters/${agent_id}.json \
    --clients=@elizaos/client-telegram \
    --plugins=@elizaos/telegram-multiagent \
    --port=${port} \
    --log-level=debug > /root/eliza/logs/${agent_id}.log 2>&1 &
  
  sleep 10
  
  # Check agent health
  curl http://localhost:${port}/health | tee -a /root/eliza/logs/agent_health_${agent_id}.log
}

# Start each additional agent
start_agent "eth_memelord_9000" 3000
start_agent "bag_flipper_9000" 3001
start_agent "linda_evangelista_88" 3002
start_agent "vc_shark_99" 3003
start_agent "code_samurai_77" 3005
```

### 5.2 Verify All Agents
```bash
# Check all agent processes
ps aux | grep "start-agent-with-patches" | grep -v grep | wc -l

# Check relay server for all registered agents
curl http://localhost:4000/health | tee -a /root/eliza/logs/all_agents_relay.log

# Check ports are active
for port in {3000..3005}; do
  curl http://localhost:${port}/health | jq .status
done

# Check logs for successful initialization
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "Checking ${agent} logs for initialization:"
  grep -E "(Plugin fully initialized|Telegram client|relay server)" /root/eliza/logs/${agent}.log | tail -n 5
done
```

**Phase 5 Success Criteria:**
- All 6 agents running ✅
- All 6 agents registered with relay server ✅
- All agents health endpoints return status "ok" ✅
- All agent logs show "Plugin fully initialized" ✅

## 🧪 Phase 6: Communication Testing

### 6.1 Test Simple Bot-to-Bot Communication
```bash
# Send a test message via API to trigger inter-bot communication
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"text":"gm everyone! #test", "chat_id": "-1002550618173"}' | tee -a /root/eliza/logs/test_message.log

# Wait for agents to process
sleep 15

# Check logs for message processing
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "===== ${agent} response log ====="
  grep -A 3 "Received Telegram message" /root/eliza/logs/${agent}.log | tail -n 20
  grep -A 3 "Forwarded to relay" /root/eliza/logs/${agent}.log | tail -n 20
  grep -A 3 "Found new messages" /root/eliza/logs/${agent}.log | tail -n 20
  grep -A 3 "Sending reply" /root/eliza/logs/${agent}.log | tail -n 20
done
```

### 6.2 Check Relay Server Message Flow
```bash
# Check relay server logs for message routing
grep "Message from" /root/eliza/logs/relay-server.log | tail -n 20
grep "Queued message for" /root/eliza/logs/relay-server.log | tail -n 20
```

**Phase 6 Success Criteria:**
- Test message successfully sent ✅
- Message appears in relay server logs ✅
- At least one agent processes the message ✅
- At least one agent generates a response ✅

## 🧪 Phase 7: Advanced Diagnostics (if needed)

### 7.1 Verify Telegram Client Connectivity
```bash
# For each agent, check if the Telegram client is initialized correctly
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "===== ${agent} Telegram client check ====="
  grep -E "(\[TELEGRAM\]|\[PATCH\] Telegram)" /root/eliza/logs/${agent}.log | tail -n 20
done

# Check for API Token availability
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "===== ${agent} Bot Token check ====="
  grep -E "(\[TELEGRAM\] (Bot token|Failed to load)|\[PLUGIN\]\[VALHALLA\]\[FLOW\])" /root/eliza/logs/${agent}.log | tail -n 20
done
```

### 7.2 Memory Management Diagnostics
```bash
# Check memory usage for processes
ps -o pid,rss,command ax | grep "start-agent-with-patches" | sort -k2 -r

# Check for memory-related logs
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "===== ${agent} Memory check ====="
  grep -E "(\[MEMORY\]|\[GC\])" /root/eliza/logs/${agent}.log | tail -n 10
done
```

**Phase 7 Success Criteria:**
- Telegram client initialized for all agents ✅
- Bot tokens successfully loaded ✅
- Memory usage is stable (not growing uncontrollably) ✅

## 🧪 Phase 8: Full Integration Test

### 8.1 Perform Live Chat Test
Send a test message to the Telegram group with ID "-1002550618173" and observe responses.

```bash
# Monitor logs in real-time during testing
tail -f /root/eliza/logs/relay-server.log /root/eliza/logs/*.log | grep -E "(Received|Sending|Message from|Plugin)"

# Alternatively, use the detailed monitoring script
./monitor_agents.sh -w -a
```

### 8.2 Check Agent Heartbeats
```bash
# Verify agents are still connected to relay
curl http://localhost:4000/health | tee -a /root/eliza/logs/final_health_check.log

# Check heartbeat activity
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  grep "heartbeat" /root/eliza/logs/${agent}.log | tail -n 5
done
```

**Phase 8 Success Criteria:**
- Live message sent to Telegram group ✅
- At least one bot responds ✅
- Relay server shows active message routing ✅
- All agents remain connected to relay server ✅

## 🏆 Complete System Success Criteria

The Valhalla system will be considered fully operational when:

1. ✅ All 6 agents are running without errors
2. ✅ All agents are registered with the relay server
3. ✅ Agents can see and process messages from other agents
4. ✅ Agents can respond to messages through Telegram
5. ✅ No memory leaks or OOM errors observed
6. ✅ System remains stable for at least 10 minutes of operation

## 🛠 Troubleshooting Guide

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Agent fails to start | Check logs for specific errors | Follow error-specific resolution |
| SQLite errors | Database connection issues | Use `USE_IN_MEMORY_DB=true` flag |
| Missing character files | Character file path resolution | Copy files to correct location as in Phase 1.3 |
| Port conflicts | Port already in use | Kill processes and clean ports as in Phase 1.1 |
| No Telegram connection | Token issues or client initialization | Check bot token environment variables and client logs |
| Relay server connection fails | Authentication or network issue | Verify RELAY_AUTH_TOKEN matches and server is running |
| Message sending fails | Client or token issue | Verify Telegram client initialization and validate tokens |

## 📝 Environment Variables Cheatsheet

```
AGENT_ID=<agent_id>                    # Agent identifier (e.g., bitcoin_maxi_420)
USE_IN_MEMORY_DB=true                  # Use in-memory database to avoid SQLite issues
RELAY_SERVER_URL=http://localhost:4000 # Relay server endpoint
RELAY_AUTH_TOKEN="elizaos-secure-relay-key" # Auth token for relay server
TELEGRAM_GROUP_IDS="-1002550618173"    # Telegram group ID for conversations
TELEGRAM_BOT_TOKEN_*                   # Bot token for each agent (uppercase agent ID)
FORCE_EXACT_PORT=true                  # Ensure agent uses specified port
DISABLE_POLLING=false                  # Keep message polling enabled
FORCE_GC=true                          # Force garbage collection to prevent memory issues
```

## 🔄 System Restart Procedure

If needed, you can restart the entire system with:

```bash
# Kill all processes (carefully avoid killing cursor-related node processes)
pkill -f "node server.js"
pkill -f "start-agent"
pkill -f "start-agent-with-patches"

# Clean ports
for port in {3000..3010} 4000; do
  fuser -k $port/tcp 2>/dev/null || true
done

# Restart relay server
cd /root/eliza/relay-server
PORT=4000 RELAY_AUTH_TOKEN="elizaos-secure-relay-key" node server.js > ../logs/relay-server.log 2>&1 &

# Wait for relay server to start
sleep 5

# Start all agents following procedures in Phases 4 and 5
``` 


Monitor agent logs 
there is very detailed monitoring script usable ./monitor_agents.sh -w -a 