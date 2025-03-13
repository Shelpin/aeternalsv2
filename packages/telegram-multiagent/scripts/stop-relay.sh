#!/bin/bash

# Stop the Telegram Relay Server for ElizaOS Multi-Agent System

# Find the process running the relay server
RELAY_PID=$(ps aux | grep "node.*relay-server.js" | grep -v grep | awk '{print $2}')

if [ -z "$RELAY_PID" ]; then
    echo "No Telegram Relay Server process found."
    exit 0
fi

# Kill the process
echo "Stopping Telegram Relay Server (PID: $RELAY_PID)..."
kill $RELAY_PID

# Check if the process was killed
sleep 2
if ps -p $RELAY_PID > /dev/null; then
    echo "Failed to stop the server gracefully. Forcing termination..."
    kill -9 $RELAY_PID
    
    # Check again
    sleep 1
    if ps -p $RELAY_PID > /dev/null; then
        echo "Error: Failed to terminate the server process."
        exit 1
    fi
fi

echo "Telegram Relay Server stopped successfully." 