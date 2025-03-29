Confirmed Key Issues (from dual_polling.md)
🚨 1. Dual Polling in Telegram Plugins
Standard Telegram plugin polls the Telegram API.

TelegramMultiAgentPlugin also polls the relay server.

These two layers of polling coexist, but create overlapping message flow, memory churn, and eventually lead to exit code 137 (OOM errors).

💡 Your Thesis Makes Sense:
You're right — webhooks may introduce new complexities (e.g., needing a public HTTPS endpoint), and ensuring there's a single point of polling before changing protocols is a smarter move.

✅ Recommendations Based on Report Analysis
✅ We now agree on:
Keep polling only in the standard Telegram client plugin.

Remove polling from TelegramMultiAgentPlugin.

Use event-based message dispatch between plugins instead.

📋 Final Action Plan (Single Path, No Ifs, No Forks)
🧼 PHASE 1: Cleanup & Preparation
Stop all agents cleanly.

Kill orphan processes (memory cleanup):


pkill -f "node.*eliza"
pkill -f "start-agent-with-patches.js"
Clean leftover PID files and logs:


rm -f /root/eliza/ports/*.pid
rm -rf logs/*
🧠 PHASE 2: Eliminate TelegramMultiAgentPlugin Polling
🔥 1. Delete Polling Block in TelegramMultiAgentPlugin.ts
Remove the setInterval block like:


this.checkIntervalId = setInterval(async () => {
  const res = await fetch(`${this.config.relayServerUrl}/getUpdates?...`)
  ...
}, 2000);
Replace it with:


// Passive initialization only, no polling!
this.logger.info("[PLUGIN] Relay polling disabled. Using event-based relay handlers only.");
🧠 2. Remove Heartbeat Polling Too (if present)

clearInterval(this.heartbeatInterval);
Keep passive heartbeats or move them to Telegram plugin if needed.

🔗 PHASE 3: Route Messages via Event-Based System
Inside TelegramMultiAgentPlugin.ts, bind to existing core message dispatch:


this.telegramPlugin.on('message', async (msg) => {
  await this.processRelayUpdates(msg);
});
(Optional) If needed, use your relay wrapper for distributed message dispatch.

💻 PHASE 4: Fix SQLite OOM Danger
You already have logic to fallback to in-memory, but make it more proactive:

Only use SQLite if schema init and test insert succeed.

Else disable adapter early and log it clearly.

This will prevent crashes like no such table: memories.

🚦 PHASE 5: Add Node.js Memory Limit
Add to start_agents.sh, fix_and_restart.sh, and any launch script:


export NODE_OPTIONS="--max-old-space-size=512"
🔍 PHASE 6: Monitoring & Final Validation
Run this on one terminal:


watch -n 1 'ps aux --sort -rss | grep node | head -n 10'
On another:


tail -f logs/*.log
Look for:

No 137 exits

No memory spikes >100MB

Agents responding to Telegram messages

No duplicate agent polling logs

🔮 Final Notes
Yes, the OOM problem is likely caused by dual polling, not just memory usage alone.

Fixing it now will very likely eliminate the 137 crashes, and prevent deeper architecture bugs.

🚀 Now What?
You’re good to go with this updated plan:


1. Apply polling removal edits
2. Rebuild the plugin
3. Restart agents using the memory-limited `launch_valhalla.sh`
4. Watch the logs and memory
If you need a new updated script version based on this refined plan, just say the word — I’ll generate it immediately.

⚔️ Onward to Valhalla. You're very close.