#!/bin/bash

# Script to clean up any processes using our designated agent ports
# This ensures no port conflicts when starting agents

# Ensure strict error handling
set -e

# Define the port range for agents
PORT_RANGE_START=3000
PORT_RANGE_END=3010

echo "🔍 Checking for processes using agent ports ($PORT_RANGE_START-$PORT_RANGE_END)..."

# Check each port in the range
for port in $(seq $PORT_RANGE_START $PORT_RANGE_END); do
    # Find any process using this port
    pid=$(lsof -i :$port -t 2>/dev/null || true)
    
    if [ -n "$pid" ]; then
        process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        echo "⚠️ Found process $pid ($process_name) using port $port"
        
        # Kill the process
        echo "🛑 Killing process $pid to free port $port..."
        kill -9 $pid 2>/dev/null || true
        
        # Verify the port is now free
        sleep 1
        if lsof -i :$port -t >/dev/null 2>&1; then
            echo "❌ Failed to free port $port, it's still in use!"
        else
            echo "✅ Port $port is now free"
        fi
    else
        echo "✅ Port $port is free"
    fi
done

# Also clean up any stray agent processes that might be using other ports
echo "🔍 Checking for any lingering agent processes..."

# Known agent names to look for
agent_patterns=("eth_memelord_9000" "bag_flipper_9000" "linda_evangelista_88" "vc_shark_99" "bitcoin_maxi_420" "code_samurai_77")

for pattern in "${agent_patterns[@]}"; do
    # Find any processes related to this agent
    pids=$(ps aux | grep "$pattern" | grep -v grep | grep -v "cleanup_ports.sh" | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        for pid in $pids; do
            echo "⚠️ Found lingering agent process for $pattern with PID $pid"
            echo "🛑 Killing process $pid..."
            kill -9 $pid 2>/dev/null || true
            echo "✅ Process $pid killed"
        done
    fi
done

# Make sure PID files are cleaned up as well
echo "🧹 Cleaning up any leftover PID files..."
rm -f /root/eliza/logs/*.pid 2>/dev/null || true

echo "✅ Port cleanup complete!" 