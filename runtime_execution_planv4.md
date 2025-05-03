# 🗺️ Runtime Execution Plan v4

Building on Plan v3 and expert feedback, this v4 plan integrates the single critical amendment and streamlines steps to full relay-driven, human-like multi-agent conversations.

---

## 1. Key Amendment from Expert

❗️ Relay subpath import is prohibited by package exports.

• **Issue**: Patching used

```js
import('@elizaos/telegram-multiagent/dist/TelegramRelay.js')
```

  which triggers:

```
ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './dist/TelegramRelay.js' is not defined by "exports"
```

• **Fix**: Import from the package entrypoint:

```diff
- const { TelegramRelay } = await import(
-   '@elizaos/telegram-multiagent/dist/TelegramRelay.js'
- );
+ const { TelegramRelay } = await import(
+   '@elizaos/telegram-multiagent'
+ );
```

And ensure the plugin's `index.ts` re-exports `TelegramRelay`:

```ts
// packages/telegram-multiagent/src/index.ts
export * from './TelegramRelay.js';
``` 

---

## 2. Full Step-by-Step Plan

### Step 1: Export `TelegramRelay` from Plugin

- Edit **`packages/telegram-multiagent/src/index.ts`**, add:

  ```ts
  // After existing exports:
  export * from './TelegramRelay.js';
  ```


### Step 2: Fix Import in Runtime Patch

- Edit **`patches/runtime-patch.js`** in `applyPatch()`:

  ```diff
  - const { TelegramRelay } = await import(
  -   '@elizaos/telegram-multiagent/dist/TelegramRelay.js'
  - );
  + const { TelegramRelay } = await import(
  +   '@elizaos/telegram-multiagent'
  + );
  ```

- This aligns with the package's `exports` in `package.json`.

### Step 3: Rebuild Plugin and Workspace

```bash
# Rebuild only the Telegram-multiagent plugin
pnpm --filter @elizaos/telegram-multiagent run build

# Then a full clean build
pnpm recursive run clean
rm -rf node_modules
devs: pnpm install
pnpm recursive run build
```

> This ensures both the plugin and patched scripts use the updated exports.

### Step 4: Relaunch Relay & Valhalla System

```bash
./relaunch_valhalla.sh
```

- Watch for:
  - No `ERR_PACKAGE_PATH_NOT_EXPORTED` errors.
  - Relay server starts (`Relay server started with PID: …`).

### Step 5: Manual Agent Startup

In separate terminals, start each agent with patches:

```bash
node patches/start-agent-with-patches.js \
  --characters=packages/agent/src/characters/eth_memelord_9000.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent,@elizaos/plugin-bootstrap \
  --port=3000 --log-level=debug

# Repeat for:
# bag_flipper_9000 (port 3001)
# linda_evangelista_88 (3002)
# vc_shark_99       (3003)
# bitcoin_maxi_420  (3004)
# code_samurai_77   (3005)
```

- Expect each agent log to show:
  ```text
  [relay] info [RELAY] Agent <agentId> registered successfully
  [relay] info [RELAY] Polling started for updates
  ```
  instead of constructor or ESM/CJS errors.

### Step 6: Verify Agent Registration

```bash
curl -s -H "Authorization: Bearer $RELAY_AUTH_TOKEN" http://localhost:4000/health | jq
```
- Should show `"agents": 6` and list all agent IDs.

### Step 7: Test Multi-Agent Conversation

1. In Telegram group (ID `TELEGRAM_GROUP_IDS`), send:
   > Hello @eth_memelord_9000_bot
2. Watch agent A's log and ensure it forwards the update to relay.
3. Confirm agent B's log picks up the update via relay polling and replies:
   > [relay] 📨 Message from eth_memelord_9000 → vc_shark_99
4. Continue ping-pong with mentions and watch both logs.

> Use realistic typing delays and ensure messages flow through `forwardToRelay` rather than direct Telegram client APIs.

---

## 3. Validation & Next Steps

- **Passed**: No `exports` errors, relay connections succeed, DB file path correct.
- **Pending**: Replace stub memory manager with real SQLite-backed or FS-backed cache (future enhancement).

Once **Plan v4** completes relay registration and conversation demonstration, you'll have a fully functional Valhalla multi-agent network. Let's implement Step 1–2, rebuild, and verify! 