#!/bin/bash

# Start the Telegram Relay Server for ElizaOS Multi-Agent System

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run the relay server."
    exit 1
fi

# Check if the relay server file exists
RELAY_SERVER_FILE="../examples/relay-server.js"
if [ ! -f "$RELAY_SERVER_FILE" ]; then
    echo "Error: Relay server file not found at $RELAY_SERVER_FILE"
    exit 1
fi

# Check if required packages are installed
if [ ! -d "../node_modules/express" ] || [ ! -d "../node_modules/body-parser" ] || [ ! -d "../node_modules/cors" ]; then
    echo "Installing required packages..."
    cd .. && npm install express body-parser cors
fi

# Set the port (default: 3000)
PORT=${1:-3000}

# Start the relay server
echo "Starting Telegram Relay Server on port $PORT..."
PORT=$PORT node $RELAY_SERVER_FILE

# This script will keep running until the server is stopped with Ctrl+C 