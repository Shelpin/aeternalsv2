FINAL VALHALLA PLAN
🧼 PHASE 1: Cleanup
Stop all agents:

./stop_agents.sh
Clean logs and pid files:

./cleanup_ports.sh
Clear stuck ports (optional):


lsof -i :3000-3010  # manually kill any stuck process
🧠 PHASE 2: Memory Leak Fixes
✅ 2.1 Fix the Relay Polling Leak
In TelegramMultiAgentPlugin.ts: Replace the current setInterval(...fetch...) logic with this memory-safe version:


setInterval(async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${this.config.relayServerUrl}/getUpdates?agent_id=${this.agentId}`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    // Clear references after use
    if (data?.messages) {
      for (let i = 0; i < data.messages.length; i++) {
        data.messages[i] = null;
      }
      data.messages = null;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      this.logger.warn('Polling request timed out.');
    } else {
      this.logger.error(`Polling failed: ${err.message}`);
    }
  }
}, 2000);
✅ 2.2 Fix SQLite Connection Leak
In FallbackMemoryManager.ts: Implement a small connection pool:


this.connectionPool = {
  connections: [],
  maxSize: 5,
  getConnection() {
    for (let conn of this.connections) {
      if (!conn.inUse) {
        conn.inUse = true;
        return conn.conn;
      }
    }
    if (this.connections.length < this.maxSize) {
      const conn = new SQLite(DB_PATH);
      this.connections.push({ conn, inUse: true });
      return conn;
    }
    return this.connections[0].conn; // fallback
  },
  releaseConnection(conn) {
    for (let c of this.connections) {
      if (c.conn === conn) c.inUse = false;
    }
  }
};
Use getConnection() and releaseConnection() in every SQLite query.

✅ 2.3 Reduce Logging Overhead
Replace all JSON.stringify(msg) log lines with:


function logMinimalMsg(msg) {
  return {
    id: msg?.message_id,
    from: msg?.from?.username,
    text: msg?.text?.slice(0, 100),
    chatId: msg?.chat?.id
  };
}
this.logger.debug("Incoming:", logMinimalMsg(msg));
This avoids stringifying entire message trees.

🧠 PHASE 3: Add Memory Limits to Node.js
In your startup script, export this:


export NODE_OPTIONS="--max-old-space-size=512"
This ensures no process exceeds 512MB in V8 heap, which gives space for native + plugins.

🚀 PHASE 4: Controlled Launch Script
Replace current fix_and_restart.sh with:


#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=512"
pnpm build

agents=("eth_memelord_9000" "vc_shark_99" "code_samurai_77" "bitcoin_maxi_420" "bag_flipper_9000" "linda_evangelista_88")
PORT=3000

for agent in "${agents[@]}"; do
  echo "Starting $agent on port $PORT"
  pnpm start --character="characters/${agent}.json" \
             --clients=@elizaos-plugins/client-telegram \
             --plugins=@elizaos/telegram-multiagent \
             --log-level=debug \
             --port=$PORT &
  PORT=$((PORT + 1))
  sleep 5
done
✅ Ensure relay server is already running before this script!

✅ PHASE 5: Monitor & Confirm
Run this to watch memory & logs:


htop  # check memory growth
watch -n 1 'ps aux --sort -rss | grep node'
tail -f logs/*.log
Agent should stay below ~350MB RAM.

☀️ Signs of Success
handleMessage is found ✅

Telegram relay messages logged ✅

No Killed (code 137) ✅

Memory usage plateaus ✅

Logs confirm SQLite fallback or success ✅

Messages show up in logs on direct mentions ✅

✅ You’re Almost There
Once this is done, the agents should:

Start cleanly

Avoid OOM

Persist memory if SQLite is healthy

Respond to mentions

Work on relay flawlessly

If you hit anything weird during implementation, just send the logs and I’ll jump back into surgery mode 🧠🔧💡

Let’s reach Valhalla together 🤝⚔️







