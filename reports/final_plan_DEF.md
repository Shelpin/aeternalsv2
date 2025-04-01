# 🛠️ Valhalla Victory Plan — Final Phased Launch Strategy (No Forks, No Maybes)

This is the final, hardened, expert-validated **one-path, zero-fork** execution plan to take the ElizaOS autonomous agent network from current status to full message-capable, bot-to-bot communication.

Each phase ends with clear success criteria and must be fully validated before proceeding.

---

## 🧩 Phase I: Structural Fixes and Codebase Hardening

### Goals:
- Fix token mismatches and agent ID inconsistencies
- Patch message handling actions
- Prepare proper environment for runtime correctness

### Steps:
1. **Update character JSONs**
   - Add explicit `agentId` fields (match the env names):
     ```json
     {
       "name": "ETHMemeLord9000",
       "agentId": "eth_memelord_9000",
       ...
     }
     ```

2. **Update runtime patching script**
   - In `apply-patches.js`, append a new message handler:
     ```ts
     runtime.registerAction({
       name: "handleMessage",
       description: "Message handler",
       handler: runtime.handleMessage.bind(runtime),
       validate: () => true,
       examples: []
     });
     ```

3. **Fix plugin logging bug**
   - Replace:
     ```ts
     Object.keys(this.runtime.actions)
     ```
     - With:
     ```ts
     this.runtime.actions.map(a => a.name)
     ```

4. **Token environment variables**
   - rename tokens to match agentId without modifiyng env if possible , if not warn before ans ask:
     ```env
     TELEGRAM_BOT_TOKEN_eth_memelord_9000=XXX
     TELEGRAM_BOT_TOKEN_bag_flipper_9000=XXX
     ...
     ```
   - Plugin reads from: `TELEGRAM_BOT_TOKEN_${agentId}`

5. **Fix relay agent ID hashing**
   - Replace the numeric ID logic:
     ```js
     id: parseInt(agent_id.replace(/\D/g, ''), 10)
     ```
     - With a deterministic hash-based ID:
     ```js
     id: require('crypto').createHash('md5').update(agent_id).digest('hex').slice(0, 8)
     ```

### ✅ Validation:
- `.env` file and character JSONs are aligned
- All runtime patches succeed including custom `handleMessage` action
- Log shows readable action names (not numeric keys)
- All agent tokens load with correct agentId mapping

---

## 🚀 Phase II: Controlled Agent Launch

### Goals:
- Launch 6 agents in clean port-bound fashion (harcded ports ethmemelord 3000, bag flipper 3001 lindaevangelist 3002 , vcshark 3003 btc maxi 3004 codeamurai 3005)
- Each connects to relay with valid token and plugin

### Steps:
1. **Stop all agents and clear ports**
   ```bash
   pkill -f patches/start-agent-with-patches
   for port in {3000..3007}; do fuser -k $port/tcp || true; done
   ```

2. **Start relay server (must be first)**
   ```bash
   cd /root/eliza/relay-server && PORT=4000 node server.js &
   sleep 3
   curl http://localhost:4000/health
   ```

3. **For each agent** (repeat):
   ```bash
   export AGENT_ID=eth_memelord_9000
   export NODE_OPTIONS="--max-old-space-size=512 --expose-gc"
   node patches/start-agent-with-patches.js --isRoot      --characters=packages/agent/src/characters/$AGENT_ID.json      --clients=@elizaos/client-telegram      --plugins=@elizaos/telegram-multiagent      --port=300X      --log-level=debug > logs/$AGENT_ID.log 2>&1 &
   sleep 3
   ```

### ✅ Validation:
- `curl http://localhost:4000/health` shows all 6 agents in `agents_list`
- Each log shows:
  - ✅ Plugin fully initialized
  - ✅ Connected to relay
  - ✅ Token loaded without error
  - ✅ Listening on expected port

---

## 📡 Phase III: Message Relay Debug + Processing Activation

### Goals:
- Ensure agents poll and receive messages from relay
- Enable successful message round-trip

### Steps:
1. **Verify polling config in agent plugin**:
   - `TelegramRelay.ts` should contain:
     ```ts
     this.pollingInterval = setInterval(() => this.fetchUpdates(), 2000);
     ```

2. **Enhance `processUpdates()` logging**
   - Log message content as soon as `getUpdates` returns it

3. **Send test message via relay API**
   ```bash
   curl -X POST http://localhost:4000/sendMessage      -H "Authorization: Bearer elizaos-secure-relay-key"      -H "Content-Type: application/json"      -d '{"agent_id":"eth_memelord_9000", "chat_id":"dummy", "text":"LFG Valhalla"}'
   ```

4. **Watch logs**:
   - Run:
     ```bash
     tail -f logs/bag_flipper_9000.log
     ```
   - Look for:
     - `RELAY: Received 1 new messages`
     - `Processing message from eth_memelord_9000`
     - `runtime.handleMessage called`

### ✅ Validation:
- At least one agent logs received message from another
- `Message stats: Processed > 0`
- Bots visibly react in Telegram (if enabled)

---

## 🧠 Phase IV: Final Sanity + Monitoring

### Goals:
- Ensure full lifecycle observability
- Confirm correctness of process monitor

### Steps:
1. **Fix `monitor_agents.sh`**
   - Use:
     ```bash
     ps -ef | grep 'start-agent-with-patches' | grep --color=auto -v grep
     ```
   - Remove reliance on stale PID files

2. **Add watchdog script** to:
   - Restart agents on failure
   - Alert on disconnection

3. **Document all agent launch + config in `README.md`**

### ✅ Validation:
- Monitoring script shows all agents UP
- Log monitoring confirms runtime activity
- Uptime > 15 minutes without crash

---

## 🎯 Phase V: Agent-to-Agent Interaction Test

### Goals:
- Prove end-to-end relay-based dialogue
- Validate multi-agent personalities in conversation

### Steps:
1. **Create Telegram group with all 6 agents**
2. **Send intro message** from one agent via relay
3. **Watch as others respond (via relay)**
4. **Enable `kickstarter` feature to simulate initial prompts**

### ✅ Victory Criteria:
- One agent sends message
- ≥1 other agents reply via relay
- Logs confirm receipt and `handleMessage` execution

---

## 🏁 Final Victory Condition

The bots are:
- Online
- Connected
- Patched
- Talking to each other
- Handling messages

You’re now in Valhalla.

LFG. ⚔️