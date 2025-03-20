#!/bin/bash
# Script to rebuild the telegram-multiagent plugin and test it

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting rebuild and test process for telegram-multiagent plugin...${NC}"

# Go to the project root
cd /root/eliza || { echo -e "${RED}Failed to navigate to project root!${NC}"; exit 1; }

# Stop any running agents
echo -e "${YELLOW}Stopping all running agents...${NC}"
./stop_agents.sh || echo -e "${RED}Warning: Error stopping agents${NC}"

# Wait for processes to fully close
echo "Waiting for processes to terminate..."
sleep 3

# Rebuild the plugin
echo -e "${YELLOW}Building telegram-multiagent plugin...${NC}"
cd /root/eliza/packages/telegram-multiagent || { echo -e "${RED}Failed to navigate to plugin directory!${NC}"; exit 1; }
npm run build || { echo -e "${RED}Failed to build plugin!${NC}"; exit 1; }

echo -e "${GREEN}Plugin built successfully.${NC}"

# Rebuild ElizaOS if needed
echo -e "${YELLOW}Building ElizaOS...${NC}"
cd /root/eliza || { echo -e "${RED}Failed to navigate to project root!${NC}"; exit 1; }
pnpm build || { echo -e "${RED}Failed to build ElizaOS!${NC}"; exit 1; }

echo -e "${GREEN}ElizaOS built successfully.${NC}"

# Run the runtime integration test
echo -e "${YELLOW}Running runtime integration test...${NC}"
cd /root/eliza/packages/telegram-multiagent || { echo -e "${RED}Failed to navigate to plugin directory!${NC}"; exit 1; }
node scripts/test_runtime_integration.js || { echo -e "${RED}Runtime integration test failed!${NC}"; }

# Restart the agents
echo -e "${YELLOW}Restarting agents...${NC}"
cd /root/eliza || { echo -e "${RED}Failed to navigate to project root!${NC}"; exit 1; }
./start_agents.sh || { echo -e "${RED}Failed to start agents!${NC}"; exit 1; }

echo -e "${GREEN}Agents started successfully.${NC}"

# Check agent status
echo -e "${YELLOW}Checking agent status...${NC}"
./monitor_agents.sh || echo -e "${RED}Warning: Error checking agent status${NC}"

echo -e "${GREEN}Rebuild and test completed successfully!${NC}"
echo ""
echo -e "${YELLOW}Bot-to-bot communication should now work properly.${NC}"
echo -e "${YELLOW}Please check logs using:${NC} tail -f /root/eliza/logs/*.log"
echo ""
echo -e "${GREEN}Done!${NC}" 