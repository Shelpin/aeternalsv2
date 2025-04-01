# 🐞 ciao_bugs.md — ElizaOS Step-by-Step Debug Plan

This document defines a **precise debugging and validation checklist**, intended to guide the developer through a successful relaunch and stabilization of the ElizaOS Valhalla Telegram-based multi-agent system.

---

## 🧪 Step-by-Step Debug Procedure

### ✅ 1. Clean Start Environment
```bash
# Kill all relay + agent processes
pkill -f "node server.js"
pkill -f "start-agent"
pkill -f "start-agent-with-patches"

# Clean all agent and relay ports
for port in {3000..3010} {4000..4010}; do
  fuser -k $port/tcp 2>/dev/null || true
done

# Clear old DB files (if not using in-memory mode)
rm -f /root/eliza/data/*.sqlite /root/eliza/data/*.db
```

---

### ✅ 2. Validate Character File Pathing
```bash
# Ensure canonical path exists and is populated
ls /root/eliza/packages/agent/src/characters/*.json
```
✅ Character files must match agent ID names (e.g., `eth_memelord_9000.json`).
❌ Remove duplicates from `/root/eliza/characters/` or other paths.

---

### ✅ 3. Patch Runtime and Inject Telegram Client
```bash
cd /root/eliza
node patches/apply-patches.js
```
Look for:
```
✅ Telegram client exposed globally through __elizaRuntime
✅ Runtime patched with handleMessage
```

---

### ✅ 4. Start Relay Server
```bash
cd /root/eliza/relay-server
PORT=4000 node server.js > ../../logs/relay-server.log 2>&1 &
sleep 5
curl http://localhost:4000/health
```
✅ Expect: `{ "status": "ok", "agents": [] }`

---

### ✅ 5. Launch Agents Sequentially
Use this template:
```bash
cd /root/eliza
export AGENT_ID=eth_memelord_9000
export USE_IN_MEMORY_DB=true
export RELAY_SERVER_URL=http://localhost:4000
export TELEGRAM_GROUP_IDS="-1002550618173"

node patches/start-agent-with-patches.js --isRoot \
  --characters=/root/eliza/packages/agent/src/characters/$AGENT_ID.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --port=3000 \
  --log-level=debug
```
✅ Adjust port and AGENT_ID per instance.

---

### ✅ 6. Telegram Connectivity Check
Check logs for:
```
✅ [PLUGIN] Plugin fully initialized
✅ [PATCH] Telegram client injected
```
✅ This confirms working connection without needing DB writes.

---

### ✅ 7. Test Message Flow
- Go to Telegram group
- Type: `gm`
- Check if any other bot replies

Logs should show:
```
[PLUGIN] Received Telegram message
[PLUGIN] Forwarded to relay
[PLUGIN] Found new messages
[PLUGIN] Sending reply to Telegram
```

---

### ✅ 8. Confirm All Agent Health
```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
...
```

✅ All agents should return status OK and show agent ID.

---

## 🔍 Troubleshooting Table

| Symptom                      | Diagnosis Tip                                | Fix                                      |
|-----------------------------|----------------------------------------------|-------------------------------------------|
| `SQLITE_ERROR`              | DB table not found                           | Use `USE_IN_MEMORY_DB=true`               |
| Port fallback in logs       | Agent picks 3001+ instead of 3000            | Clean ports + set `FORCE_EXACT_PORT=true` |
| Plugin not initialized      | Missing `Plugin fully initialized` log       | Check plugin loader and export method     |
| Agent not in relay          | Missing from `/health` endpoint              | Confirm relay URL and heartbeat logs      |
| Telegram bot no response    | No reply to `gm`                             | Check receiving bot's logs for messages   |

---

## ✅ Endgame: What Confirms Success?

✅ All agents:
- Log successful runtime + plugin initialization
- Appear on relay `/health`
- Respond to Telegram messages
- Use correct ports + in-memory DB

🎯 Once these are true, your bots are **fully operational.**
