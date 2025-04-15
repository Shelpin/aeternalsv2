#!/bin/bash
# Usage: ./scripts/launch-agent.sh <AGENT_ID> <AGENT_PORT>

# Validate input
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Error: Missing arguments. Usage: $0 <AGENT_ID> <AGENT_PORT>"
  exit 1
fi

AGENT_ID=$1
AGENT_PORT=$2

# Ensure script is run from the root directory
if [ ! -f ".env" ]; then
    echo "Error: Please run this script from the project root directory."
    exit 1
fi

# Export necessary variables
export AGENT_ID=$AGENT_ID
export AGENT_PORT=$AGENT_PORT
export RELAY_SERVER_URL=http://localhost:4000 # Or your actual relay URL
export RELAY_AUTH_TOKEN=$(grep '^RELAY_AUTH_TOKEN=' .env | cut -d '=' -f2)
export TELEGRAM_GROUP_IDS="-1002550681173" # Replace with your actual Group ID

# Dynamically get the correct Telegram Bot Token
TOKEN_VAR_NAME="TELEGRAM_BOT_TOKEN_${AGENT_ID}"
export TELEGRAM_BOT_TOKEN=$(grep "^${TOKEN_VAR_NAME}=" .env | cut -d '=' -f2)

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Error: Could not find Telegram token for agent ${AGENT_ID} in .env file (expected variable: ${TOKEN_VAR_NAME})"
    exit 1
fi

echo "Starting agent ${AGENT_ID} on port ${AGENT_PORT} using token ${TOKEN_VAR_NAME}..."

# Execute the agent startup script
# Ensure paths are correct relative to the root directory
NODE_OPTIONS=--expose-gc node patches/start-agent-with-patches.js \
 --isRoot \
 --characters=packages/agent/src/characters/${AGENT_ID}.json \
 --clients=@elizaos/clients-telegram \
 --plugins=@elizaos/telegram-multiagent \
 --port=${AGENT_PORT} \
 --log-level=info # Use info level for normal operation, debug if needed 