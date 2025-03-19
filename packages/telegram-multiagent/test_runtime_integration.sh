#!/bin/bash

# Color codes for better readability
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting runtime integration test script${NC}"

# Step 1: Build the telegram-multiagent plugin
echo -e "\n${BLUE}Building telegram-multiagent plugin${NC}"
cd /root/eliza/packages/telegram-multiagent
node build-yolo.js

# Check if the build was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Build successful${NC}"
else
    echo -e "${RED}Build failed${NC}"
    exit 1
fi

# Step 2: Build ElizaOS to include the changes
echo -e "\n${BLUE}Building ElizaOS with the plugin changes${NC}"
cd /root/eliza
npm run build -- --filter=@elizaos/telegram-multiagent

# Check if the build was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}ElizaOS build successful${NC}"
else
    echo -e "${RED}ElizaOS build failed${NC}"
    exit 1
fi

# Step 3: Set environment variables
echo -e "\n${BLUE}Setting environment variables${NC}"
export TELEGRAM_GROUP_IDS="-1002550618173"
export FORCE_BOT_RESPONSES=true
echo "Group IDs: $TELEGRAM_GROUP_IDS"
echo "Force bot responses: $FORCE_BOT_RESPONSES"

# Step 4: Restart agents
echo -e "\n${BLUE}Restarting agents${NC}"
cd /root/eliza
./stop_agents.sh
./start_agents.sh linda_evangelista_88 vc_shark_99

# Step 5: Wait for agents to initialize
echo -e "\n${BLUE}Waiting for agents to initialize (30 seconds)${NC}"
for i in {30..1}; do
    echo -ne "Waiting... $i\r"
    sleep 1
done
echo -e "\n${GREEN}Initialization wait complete${NC}"

# Step 6: Check logs for runtime initialization
echo -e "\n${BLUE}Checking logs for runtime initialization${NC}"
echo -e "${YELLOW}Linda's logs:${NC}"
grep -n "\[RUNTIME\]" /root/eliza/logs/linda_evangelista_88.log | tail -n 10
echo -e "\n${YELLOW}VCShark's logs:${NC}"
grep -n "\[RUNTIME\]" /root/eliza/logs/vc_shark_99.log | tail -n 10

# Step 7: Send a test message from VCShark to Linda
echo -e "\n${GREEN}Sending test message from VCShark to Linda${NC}"
sender="vc_shark_99"
receiver="linda_evangelista_88"
content="Hey @$receiver, what are your thoughts on sustainable fashion and how it fits with current Y2K revival trends?"
echo -e "${BLUE}Message:${NC} $content"

# Use direct_telegram.js to send the message
cd /root/eliza
node packages/telegram-multiagent/scripts/direct_telegram.js --server=http://207.180.245.243:4000 --token=elizaos-secure-relay-key --from=$sender --group=$TELEGRAM_GROUP_IDS --text="$content"

# Step a: Wait for response
echo -e "\n${BLUE}Waiting for processing (10 seconds)${NC}"
sleep 10

# Step 8: Monitor logs for activity
echo -e "\n${BLUE}Monitoring logs for message processing${NC}"
echo -e "${YELLOW}Linda's logs for message receipt:${NC}"
grep -n "\[BOT MSG DEBUG\]" /root/eliza/logs/linda_evangelista_88.log | tail -n 15

echo -e "\n${YELLOW}Linda's logs for tag detection:${NC}"
grep -n "shouldRespond\|isAgentTaggedInMessage" /root/eliza/logs/linda_evangelista_88.log | tail -n 10

echo -e "\n${YELLOW}VCShark's logs for runtime availability:${NC}"
grep -n "isRuntimeAvailable\|waitForRuntime" /root/eliza/logs/vc_shark_99.log | tail -n 10

# Step 9: Send a test message from Linda to VCShark
echo -e "\n${GREEN}Sending test message from Linda to VCShark${NC}"
sender="linda_evangelista_88"
receiver="vc_shark_99"
content="@$receiver I think sustainable fashion is crucial in this Y2K revival. What investment opportunities do you see in eco-friendly fashion startups?"
echo -e "${BLUE}Message:${NC} $content"

# Use direct_telegram.js to send the message
cd /root/eliza
node packages/telegram-multiagent/scripts/direct_telegram.js --server=http://207.180.245.243:4000 --token=elizaos-secure-relay-key --from=$sender --group=$TELEGRAM_GROUP_IDS --text="$content"

# Step 10: Wait for response
echo -e "\n${BLUE}Waiting for processing (10 seconds)${NC}"
sleep 10

# Step 11: Final check for activity
echo -e "\n${YELLOW}VCShark's logs for message response:${NC}"
grep -n "\[BOT MSG DEBUG\]" /root/eliza/logs/vc_shark_99.log | tail -n 15

echo -e "\n${GREEN}Test completed. Check the full logs for more details.${NC}"
echo -e "${YELLOW}Full log commands:${NC}"
echo "- Linda's logs: tail -f /root/eliza/logs/linda_evangelista_88.log | grep -E \"\[BOT MSG DEBUG\]|TelegramMultiAgentPlugin\""
echo "- VCShark's logs: tail -f /root/eliza/logs/vc_shark_99.log | grep -E \"\[BOT MSG DEBUG\]|TelegramMultiAgentPlugin\"" 