#!/bin/bash

# Complete cleanup and restart script for ElizaOS Telegram Multi-Agent System
# This will forcefully stop all agents and the relay server and start fresh

# Enforce bash settings
set -e # Exit on error

echo "🧹 Performing complete system cleanup..."

# Stop all agent processes
echo "📋 Stopping all known agent processes..."
if [ -f "./stop_agents.sh" ]; then
  ./stop_agents.sh
fi

# Kill any lingering agent processes that might not have been stopped properly
echo "🔍 Finding and stopping any lingering agent processes..."
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 bitcoin_maxi_420 code_samurai_77; do
  # Find any processes related to this agent
  pids=$(ps aux | grep "$agent" | grep -v grep | awk '{print $2}')
  if [ -n "$pids" ]; then
    echo "  - Found processes for $agent: $pids"
    for pid in $pids; do
      echo "  - Killing process $pid"
      kill -9 $pid 2>/dev/null || true
    done
  fi
done

# Kill all Telegram client processes
echo "📱 Stopping all Telegram client processes..."
pids=$(ps aux | grep "client-telegram" | grep -v grep | awk '{print $2}')
if [ -n "$pids" ]; then
  echo "  - Found Telegram client processes: $pids"
  for pid in $pids; do
    echo "  - Killing process $pid"
    kill -9 $pid 2>/dev/null || true
  done
fi

# Stop the relay server if running
echo "🔄 Stopping relay server..."
pids=$(ps aux | grep "node.*server.js" | grep -v grep | awk '{print $2}')
if [ -n "$pids" ]; then
  echo "  - Found relay server processes: $pids"
  for pid in $pids; do
    echo "  - Killing process $pid"
    kill -9 $pid 2>/dev/null || true
  done
fi

# Clear logs
echo "📔 Clearing logs..."
if [ -f "./clear_logs.sh" ]; then
  ./clear_logs.sh
fi

# Ensure the relay plugin configuration exists
echo "⚙️ Setting up relay plugin configuration..."
PLUGIN_DIR="/root/eliza/agent/config/plugins"
mkdir -p $PLUGIN_DIR

CONFIG_FILE="$PLUGIN_DIR/telegram-multiagent.json"
cat > $CONFIG_FILE << EOF
{
  "relayServerUrl": "http://localhost:4000", 
  "authToken": "elizaos-secure-relay-key",
  "groupIds": [-1002550618173],
  "conversationCheckIntervalMs": 30000,
  "enabled": true,
  "typingSimulation": {
    "enabled": true,
    "baseTypingSpeedCPM": 300,
    "randomVariation": 0.2
  }
}
EOF
chmod 640 $CONFIG_FILE
echo "  - Created config at $CONFIG_FILE"

# Start the relay server
echo "🚀 Starting relay server..."
cd /root/eliza && ./relay-server/start-relay.sh > logs/relay-server.log 2>&1 &
sleep 5

# Verify relay server is running
echo "🔍 Verifying relay server..."
if curl -s http://localhost:4000/health | grep -q "status.*ok"; then
  echo "✅ Relay server is running correctly"
else
  echo "❌ Relay server failed to start. Check logs/relay-server.log"
  exit 1
fi

# Start all agents
echo "🚀 Starting all agents..."
./start_agents.sh

echo "🏁 Complete system restart finished!"
echo "📊 Monitor agents with: ./monitor_agents.sh -w" 