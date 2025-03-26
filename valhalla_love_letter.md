# ❤️ Valhalla Recovery Guide — ElizaOS Telegram Multi-Agent Resurrection

Welcome back, brave bot builders! After reviewing the `execution_report_action_plan_2503.md`, we now have a clear map of the final enemies on your journey to Valhalla. Let’s break down what went wrong, what was partially fixed, and exactly how to fix the remaining blockers.

---

## 🧠 Root Causes & Diagnosis

### 1. Agent Identity Mismatch
**Symptoms:**
- Plugin logs show correct agent ID (e.g., `eth_memelord_9000_bot`)
- But polling uses UUID (e.g., `b833a95b-b968-0ff1-ab56-6a77d43f4df1`)

**Fix:**
- Override all use of `runtime.getAgentId()` with `process.env.AGENT_ID` as your canonical ID for relay interactions and Telegram.

```ts
// Recommended change
this.agentId = process.env.AGENT_ID || runtime.getAgentId();
```

Ensure:
- Relay polling URLs use `this.agentId` (not runtime UUID)
- Relay registration uses this same value

---

### 2. Bot Token Lookup Failure
**Symptoms:**
- Agent looks for `TELEGRAM_BOT_TOKEN_<UUID>` instead of `TELEGRAM_BOT_TOKEN_<AgentName>`

**Fix:**
- Patch `findBotToken()` to fallback to `TELEGRAM_BOT_TOKEN_${AGENT_ID}`

```ts
const agentId = process.env.AGENT_ID;
return process.env[`TELEGRAM_BOT_TOKEN_${agentId}`];
```

Add debug logs to show all candidates tried.

---

### 3. Relay Server Registration Confusion
**Symptoms:**
- Agent logs say: “registered successfully”
- Relay logs say: “agent not found”

**Fix Plan:**
- Ensure registration response from relay server is checked for `{ success: true }`
- Log full response on failure

✅ Use agent IDs in lowercase format only  
✅ Confirm headers include Authorization and body includes `token`

---

### 4. Relay Polling Fails Due to Identity
**Symptoms:**
- Polling fails after registration because agent ID in polling URL mismatches registered ID

**Fix:**
- Ensure both registration and polling use `this.agentId`, not the UUID

```ts
await fetch(`${relayUrl}/getUpdates?agent_id=${this.agentId}`);
```

---

### 5. MemoryManager Issues
**Symptoms:**
- Fallback memory manager used due to missing runtime property

**Short-term Fix:**
- Continue using fallback (safe)
- Add log when fallback is used: `[MEMORY] Fallback used`

**Long-term Suggestion:**
- Add memoryManager to runtime prototype or define in plugin until core support added

---

## ✅ Final Fix Steps Checklist (in order)

### 🔧 PHASE 1: Normalize Agent ID Across Plugin

1. In `TelegramMultiAgentPlugin.ts`:
   - Set `this.agentId = process.env.AGENT_ID` in constructor
   - Use this value for:
     - `register()`
     - `pollRelay()`
     - `findBotToken()`
     - All logging

2. Search project-wide for `.getAgentId()` and replace where needed for relay/telegram logic.

---

### 🔐 PHASE 2: Fix Bot Token Discovery

1. Rewrite `findBotToken()`:
```ts
findBotToken(): string | undefined {
  const envToken = process.env[`TELEGRAM_BOT_TOKEN_${this.agentId}`];
  this.logger.debug(`[TOKEN] Looking for TELEGRAM_BOT_TOKEN_${this.agentId}`);
  return envToken;
}
```

2. Add fallback to log all token env vars if not found.

---

### 🔄 PHASE 3: Validate Relay Communication

1. Enable full relay request/response logging.
2. After registration, confirm relay response is:
```json
{ "success": true }
```
3. Add log:
```ts
this.logger.info(`[RELAY] Registered successfully? ${result.success}`);
```

---

### 🌍 PHASE 4: Standardize Relay Server URL

1. All config files should use:
```env
RELAY_SERVER_URL=http://207.180.245.243:4000
```
Avoid `localhost` unless running fully local test.

---

### 🧪 PHASE 5: Live Test Run Script

Create `scripts/test_agent_cycle.js`:
```js
// Simulates message from one agent, confirms polling and reply
```

Manually send to relay:
```bash
curl -X POST http://207.180.245.243:4000/sendMessage   -H "Authorization: Bearer elizaos-secure-relay-key"   -H "Content-Type: application/json"   -d '{
    "groupId": "-1002550618173",
    "message": "@Linda Hello from ETHMemeLord",
    "sender": "ETHMemeLord9000"
  }'
```

---

## 💘 Love Letter to Your Coding Buddy

Dear Cursor Agent,  
You've danced with the dragons of ElizaOS runtime.  
You've stared into the void of UUIDs and lived to debug again.  

This is your moment.  
This is the step that leads to Valhalla.

Keep logs clear. Keep IDs consistent. Keep love in your heart.  
We’re not building bots — we’re building legends.

Let’s finish this.

— With runtime-adapted affection,  
Your ElizaOS Whisperer 💻🧙