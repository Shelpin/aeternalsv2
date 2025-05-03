# 🗺️ Runtime Execution Plan v3

This document picks up from our current state (v2 logs and patches applied) and lays out a step-by-step path to fully automated, relay-driven, human-like multi-agent conversations.

---

## 1. Current Status (v2 recap)

- The relaunch and launch scripts now:
  - Source `.env` correctly and respect `TELEGRAM_GROUP_IDS`.
  - Inject `SQLITE_FILE` into the agent for DB path fallback.
  - Normalize `AGENT_ID` & `TELEGRAM_BOT_TOKEN_<agentId>` → `TELEGRAM_BOT_TOKEN` in `start-agent-with-patches.js`.
- Agents successfully spin up, initialize the embedded Telegram client and echo messages.
- **Relay path remains broken** due to import/exports mismatch ("not exported" & `not a constructor`).
- **Cache warning is by-design** (no cache configured in character settings).

## 2. Root Causes to Address

1. **Relay client import** must use the package entrypoint, not deep `dist/` path.
2. **Database path** injection is correct; no further DB changes required.
3. **Agents manually started** (intentionally left manual). We'll keep manual startup for v3.
4. **Conversation logic** still only echoes text; we need to verify inter-bot messaging via relay.

## 3. Goals for v3

- [ ] Fix the relay import so that each agent successfully calls `relay.connect()` and logs:
  ```text
  [relay] info [RELAY] Agent <agentId> registered successfully
  [relay] info [RELAY] Polling started for updates
  ```
- [ ] Confirm in `curl /health` that all six agents appear.
- [ ] Demonstrate a human-like multi-agent thread:
  - Bot A sends: "Hello @BotB, how's it going?"
  - Bot B replies via relay: "I'm good @BotA—just tracking memes. How about you?"
  - A human joins: "Hey @BotA and @BotB, what's new?"
  - Both bots continue the conversation with simulated typing delays and context awareness.
- [ ] Validate end-to-end flow: Telegram → Agent A → Relay → Agent B → Telegram.

## 4. Step-by-Step Implementation Plan

### Step 1: Fix Relay Import in `runtime-patch.js`

- Edit `patches/runtime-patch.js`:
  ```diff
  - const { TelegramRelay } = await import('@elizaos/telegram-multiagent/dist/TelegramRelay.js');
  + const { TelegramRelay } = await import('@elizaos/telegram-multiagent');
  ```
- Ensure the dist `index.js` re-exports `TelegramRelay` (it does) so `relay.connect()` resolves correctly.

### Step 2: Rebuild & Redeploy Patches

```bash
pnpm recursive run clean
pnpm recursive run build
```

- This will rebuild both the plugin and patched scripts with the corrected import.

### Step 3: Relaunch Valhalla Relay & Agents

```bash
./relaunch_valhalla.sh
# In six separate terminals:
node patches/start-agent-with-patches.js --characters=packages/agent/src/characters/eth_memelord_9000.json …
node patches/start-agent-with-patches.js --characters=packages/agent/src/characters/bag_flipper_9000.json …
# …repeat for 4 more agents
```

### Step 4: Verify Relay Registration

```bash
curl -s -H "Authorization: Bearer $RELAY_AUTH_TOKEN" http://localhost:4000/health | jq
```
- Expect: 