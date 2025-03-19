#!/bin/bash

# Colors for better output readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================================${NC}"
echo -e "${GREEN}=       BOT COMMUNICATION TEST - SUPER YOLO MODE        =${NC}"
echo -e "${GREEN}=========================================================${NC}"

# Stop any running agents first
echo -e "${YELLOW}Stopping any running agents...${NC}"
cd /root/eliza
./stop_agents.sh
sleep 2

# Build the plugin with YOLO mode
echo -e "${YELLOW}Building telegram-multiagent plugin in YOLO mode...${NC}"
cd /root/eliza/packages/telegram-multiagent
node build-yolo.js
if [ $? -ne 0 ]; then
    echo -e "${RED}YOLO build failed! Continuing anyway...${NC}"
fi

# Return to root and build all of ElizaOS
echo -e "${YELLOW}Building ElizaOS...${NC}"
cd /root/eliza
pnpm build
if [ $? -ne 0 ]; then
    echo -e "${RED}ElizaOS build failed! But we're in YOLO mode, continuing...${NC}"
fi

# Set environment variables for the test
export TELEGRAM_GROUP_IDS="-1002550618173"
echo -e "${CYAN}Using Telegram group ID: ${TELEGRAM_GROUP_IDS}${NC}"

# Set shouldIgnoreBotMessages=false for all agents
echo -e "${YELLOW}Setting shouldIgnoreBotMessages=false for all agents...${NC}"
cd /root/eliza/characters
find . -name "*.json" -exec sh -c 'echo "Checking $1"; if grep -q "shouldIgnoreBotMessages" "$1"; then sed -i "s/\"shouldIgnoreBotMessages\": true/\"shouldIgnoreBotMessages\": false/g" "$1" && echo "  → Updated $1"; fi' sh {} \;

# Start agents in the background
echo -e "${YELLOW}Starting agents...${NC}"
cd /root/eliza
./start_agents.sh
echo -e "${GREEN}Agents started! Waiting for initialization...${NC}"
sleep 15

# Test message sending between bots
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
echo -e "${CYAN}Test timestamp: ${TIMESTAMP}${NC}"

# Function to send a test message using direct_telegram.js
send_test_message() {
    sender=$1
    target=$2
    content=$3
    
    echo -e "${YELLOW}Sending test message from ${PURPLE}${sender}${YELLOW} to ${PURPLE}${target}${YELLOW}...${NC}"
    echo -e "${BLUE}Content: ${content}${NC}"
    
    cd /root/eliza/packages/telegram-multiagent/scripts
    
    # Run with node, capturing output
    node direct_telegram.js --server=http://207.180.245.243:4000 --token=elizaos-secure-relay-key --from=$sender --group=$TELEGRAM_GROUP_IDS --text="$content"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Message sent successfully!${NC}"
    else
        echo -e "${RED}Failed to send message!${NC}"
    fi
}

# Test 1: VCShark to Linda
echo -e "\n${CYAN}TEST 1: VCShark to Linda ${NC}"
send_test_message "vcshark" "lindaevangelista" "Hey @lindaevangelista, what do you think about the latest fashion trends? #test_${TIMESTAMP}"

# Test 2: Linda to VCShark
echo -e "\n${CYAN}TEST 2: Linda to VCShark ${NC}"
send_test_message "lindaevangelista" "vcshark" "Hey @vcshark, have you seen any interesting tech startups lately? #test_${TIMESTAMP}"

# Wait for processing
echo -e "\n${YELLOW}Waiting for messages to be processed...${NC}"
sleep 5

# Show logs to see what's happening
echo -e "\n${CYAN}Checking logs for the bot communication...${NC}"
echo -e "${YELLOW}Press Ctrl+C to exit log viewing${NC}"
cd /root/eliza

# Use grep to filter logs for relevant BOT MSG DEBUG entries
tail -f logs/*.log | grep -E '\[BOT MSG DEBUG|vcshark|linda'

echo -e "${GREEN}Test complete!${NC}" 