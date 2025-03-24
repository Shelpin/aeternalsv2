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

# Test script to verify runtime integration and waitForRuntime pattern
# This script should be run after ElizaOS is running

echo "===== TELEGRAM MULTI-AGENT RUNTIME INTEGRATION TEST ====="
echo "Testing runtime availability and waitForRuntime pattern"
echo "This script will help diagnose runtime integration issues"
echo

# Check for required environment variables
echo "Checking environment..."
if [ -z "$AGENT_ID" ]; then
  echo "⚠️  WARNING: AGENT_ID environment variable not set"
  echo "   This may cause the plugin to fall back to 'unknown' agent ID"
else
  echo "✅ AGENT_ID is set to: $AGENT_ID"
fi

if [ -z "$RELAY_SERVER_URL" ]; then
  echo "⚠️  WARNING: RELAY_SERVER_URL not set, will use default"
else
  echo "✅ RELAY_SERVER_URL is set to: $RELAY_SERVER_URL"
fi

if [ -z "$RELAY_AUTH_TOKEN" ]; then
  echo "⚠️  WARNING: RELAY_AUTH_TOKEN not set, will use default"
else
  echo "✅ RELAY_AUTH_TOKEN is set (value hidden)"
fi

# Create a simple test script to verify runtime methods
echo "Creating test script..."
cat > /tmp/runtime_test.js << 'EOF'
import { PluginComponent } from './src/PluginComponent.js';

// Simple test class to verify runtime is fully available
class RuntimeTester extends PluginComponent {
  constructor() {
    const logger = {
      trace: (msg) => console.log(`[TRACE] ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.log(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`)
    };
    super(logger);
  }

  async testRuntimeAvailability(runtime) {
    this.setRuntime(runtime);
    
    console.log("\n===== RUNTIME AVAILABILITY TEST =====");
    console.log("Testing waitForRuntime pattern...");
    
    try {
      console.log("Waiting for runtime to be available (10 second timeout)...");
      const startTime = Date.now();
      const runtimeInstance = await this.waitForRuntime(10000);
      const elapsed = Date.now() - startTime;
      console.log(`✅ SUCCESS: Runtime available after ${elapsed}ms`);
      
      // Verify critical methods
      console.log("\nVerifying critical runtime methods:");
      
      // Check getAgentId
      try {
        const agentId = runtimeInstance.getAgentId();
        console.log(`✅ getAgentId: "${agentId}"`);
      } catch (error) {
        console.error(`❌ getAgentId failed: ${error.message}`);
      }
      
      // Check getLogger
      try {
        const logger = runtimeInstance.getLogger();
        console.log("✅ getLogger: available");
      } catch (error) {
        console.error(`❌ getLogger failed: ${error.message}`);
      }
      
      // Check memoryManager
      if (runtimeInstance.memoryManager) {
        console.log("✅ memoryManager: available");
        
        try {
          const createMemory = runtimeInstance.memoryManager.createMemory;
          if (typeof createMemory === 'function') {
            console.log("✅ memoryManager.createMemory: available");
          } else {
            console.error("❌ memoryManager.createMemory: not a function");
          }
        } catch (error) {
          console.error(`❌ memoryManager.createMemory access error: ${error.message}`);
        }
        
        try {
          const getMemories = runtimeInstance.memoryManager.getMemories;
          if (typeof getMemories === 'function') {
            console.log("✅ memoryManager.getMemories: available");
          } else {
            console.error("❌ memoryManager.getMemories: not a function");
          }
        } catch (error) {
          console.error(`❌ memoryManager.getMemories access error: ${error.message}`);
        }
      } else {
        console.error("❌ memoryManager: not available");
      }
      
      // Check handleMessage
      try {
        const handleMessage = runtimeInstance.handleMessage;
        if (typeof handleMessage === 'function') {
          console.log("✅ handleMessage: available");
        } else {
          console.error("❌ handleMessage: not a function");
        }
      } catch (error) {
        console.error(`❌ handleMessage access error: ${error.message}`);
      }
      
      // Check getCharacter
      try {
        const getCharacter = runtimeInstance.getCharacter;
        if (typeof getCharacter === 'function') {
          console.log("✅ getCharacter: available");
        } else {
          console.error("❌ getCharacter: not a function");
        }
      } catch (error) {
        console.error(`❌ getCharacter access error: ${error.message}`);
      }
      
      console.log("\n===== TEST COMPLETE =====");
      console.log("Runtime integration test completed.");
      
      return true;
    } catch (error) {
      console.error(`❌ FAILED: Runtime wait failed: ${error.message}`);
      return false;
    }
  }
}

// Export the tester
export const runtimeTester = new RuntimeTester();
EOF

echo "Converting file to ESM format..."

# Check recent logs
echo "Checking recent logs for runtime issues..."
if [ -f "/root/eliza/logs/vc_shark_99.log" ]; then
  echo "Recent log entries containing waitForRuntime or isRuntimeAvailable:"
  grep -n "isRuntimeAvailable\|waitForRuntime" /root/eliza/logs/vc_shark_99.log | tail -n 10
else
  echo "No recent logs found. Run the agent first to generate logs."
fi

echo
echo "===== TEST COMPLETE ====="
echo
echo "To run the test, make sure ElizaOS is running, then:"
echo "1. Navigate to the telegram-multiagent directory"
echo "2. Run 'node --experimental-modules /tmp/runtime_test.js'"
echo
echo "You should see runtime method checks in the output."
echo "If waitForRuntime times out or methods are undefined, the issue is with"
echo "the runtime not being fully initialized before access." 