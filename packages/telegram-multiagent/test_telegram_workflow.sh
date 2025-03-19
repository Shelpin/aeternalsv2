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
echo -e "${GREEN}=     TELEGRAM FULL WORKFLOW TEST - BOT COMMUNICATION    =${NC}"
echo -e "${GREEN}=========================================================${NC}"

# Configuration
TELEGRAM_GROUP_ID="-1002550618173"  # Replace with your test group ID
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN_VCShark99}  # Use an actual bot token
TIMESTAMP=$(date +%s)

# 1. Clean restart of the system
echo -e "${YELLOW}Performing a clean restart of all agents...${NC}"
cd /root/eliza
./clean_restart.sh

# 2. Wait for agents to fully initialize (longer wait time for real operation)
echo -e "${YELLOW}Waiting for agents to fully initialize...${NC}"
sleep 30

# 3. Verify all agents are running and have created conversation managers
echo -e "${YELLOW}Verifying all agents are running and initialized...${NC}"
ps aux | grep -E "node.*characters" | grep -v grep

# 4. Check that conversation managers are properly initialized
echo -e "${YELLOW}Checking conversation manager initialization...${NC}"
function check_conversation_manager() {
    local agent_name=$1
    local log_file="/root/eliza/logs/${agent_name}.log"
    
    echo -e "${BLUE}Checking conversation manager for ${agent_name}...${NC}"
    
    # Look for successful initialization messages
    if grep -q "Initialized conversation manager for group" "$log_file"; then
        echo -e "${GREEN}✓ Conversation manager initialized for ${agent_name}${NC}"
        return 0
    else
        echo -e "${RED}✗ No conversation manager initialization found for ${agent_name}${NC}"
        
        # Force conversation manager creation with a simple message
        echo -e "${YELLOW}Sending kickstart message to initialize conversation manager...${NC}"
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_GROUP_ID}" \
            -d "text=Initializing conversation for ${agent_name} #cm_init_${TIMESTAMP}"
        
        # Wait for initialization
        echo -e "${YELLOW}Waiting for conversation manager to initialize...${NC}"
        sleep 10
        
        # Check again
        if grep -q "Initialized conversation manager for group" "$log_file"; then
            echo -e "${GREEN}✓ Conversation manager successfully initialized for ${agent_name}${NC}"
            return 0
        else
            echo -e "${RED}✗ Failed to initialize conversation manager for ${agent_name}${NC}"
            return 1
        fi
    fi
}

# Check conversation managers for key agents
check_conversation_manager "linda_evangelista_88"
check_conversation_manager "vc_shark_99"

# 5. Send a direct message via Telegram API from VCShark to Linda
echo -e "${YELLOW}Sending a direct message via Telegram API from VCShark to Linda...${NC}"

function send_telegram_message() {
    local token=$1
    local chat_id=$2
    local text=$3
    
    echo -e "${BLUE}Sending message to group ${chat_id}:${NC}"
    echo -e "${PURPLE}\"${text}\"${NC}"
    
    # Send message using the Telegram API
    local response=$(curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
        -d "chat_id=${chat_id}" \
        -d "text=${text}" \
        -H "Content-Type: application/json")
    
    # Check if message was sent successfully
    if echo "$response" | grep -q "\"ok\":true"; then
        echo -e "${GREEN}Message sent successfully via Telegram API${NC}"
        # Extract message ID for reference
        local msg_id=$(echo "$response" | grep -o '"message_id":[0-9]*' | cut -d':' -f2)
        echo -e "${BLUE}Message ID: ${msg_id}${NC}"
    else
        echo -e "${RED}Failed to send message via Telegram API${NC}"
        echo -e "${RED}Response: ${response}${NC}"
    fi
}

# Use the VCShark token to send a message mentioning Linda
MESSAGE="Hey @linda_evangelista_88, what are your thoughts on sustainable fashion trends for 2025? #real_telegram_test_${TIMESTAMP}"
send_telegram_message "$TELEGRAM_BOT_TOKEN" "$TELEGRAM_GROUP_ID" "$MESSAGE"

# Wait for response processing
echo -e "${YELLOW}Waiting for message to be processed...${NC}"
sleep 5

# 6. Verify tag detection worked by checking logs
echo -e "${YELLOW}Verifying message processing and tag detection...${NC}"

function check_tag_detection() {
    local log_file="/root/eliza/logs/linda_evangelista_88.log"
    local tag_marker="Tags detected"
    local timeout=30  # seconds to wait for detection
    local start_time=$(date +%s)
    
    echo -e "${BLUE}Looking for tag detection in logs (timeout: ${timeout}s)...${NC}"
    
    while true; do
        if grep -q "$tag_marker" "$log_file"; then
            echo -e "${GREEN}✓ Tag detection found in logs!${NC}"
            grep -A 5 "$tag_marker" "$log_file" | tail -6
            return 0
        fi
        
        # Check timeout
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        if [ $elapsed -ge $timeout ]; then
            echo -e "${RED}✗ Tag detection not found within timeout period${NC}"
            return 1
        fi
        
        # Wait a second before checking again
        sleep 1
        echo -n "."
    done
}

check_tag_detection

# 7. Monitor logs to see if the message is processed correctly
echo -e "\n${YELLOW}Monitoring logs for bot-to-bot communication...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop monitoring${NC}\n"

# Create a temporary monitoring script to monitor multiple log files
TMP_MONITOR="/tmp/monitor_logs.sh"
cat > $TMP_MONITOR << 'EOL'
#!/bin/bash
# Monitor multiple log files with colored output for different patterns

# Define colors for different patterns
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Function to colorize output based on patterns
colorize() {
    sed -E "s/\[BOT MSG DEBUG\]/${YELLOW}&${NC}/g" |
    sed -E "s/mention|tag|tags|linda|vcshark|vc_shark/${GREEN}&${NC}/g" |
    sed -E "s/error|ERROR|failed|FAILED/${RED}&${NC}/g" |
    sed -E "s/shouldRespond|RESPOND|respond|decision|enhance/${BLUE}&${NC}/g" |
    sed -E "s/TelegramRelay/${CYAN}&${NC}/g" |
    sed -E "s/fromBot|is_bot|sender_agent_id/${PURPLE}&${NC}/g"
}

# Monitor relevant logs
tail -f /root/eliza/logs/linda_evangelista_88.log /root/eliza/logs/vc_shark_99.log /root/eliza/logs/relay_server.log | grep -E "\[BOT MSG DEBUG\]|mention|tag|linda|vcshark|vc_shark|TelegramRelay|shouldRespond|decision|RESPOND" | colorize
EOL

chmod +x $TMP_MONITOR
$TMP_MONITOR 