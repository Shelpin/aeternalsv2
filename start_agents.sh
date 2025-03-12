#!/bin/bash

# Configuration
LOG_DIR="/root/eliza/logs"
ROTATE_SIZE="100M"
ROTATE_COUNT=5
mkdir -p $LOG_DIR

# Agent definitions
declare -A AGENTS=(
    ["bitcoin_maxi_420"]="TELEGRAM_BOT_TOKEN_BitcoinMaxi420"
    ["eth_memelord_9000"]="TELEGRAM_BOT_TOKEN_ETHMemeLord9000"
    ["code_samurai_77"]="TELEGRAM_BOT_TOKEN_CodeSamurai77"
    ["bag_flipper_9000"]="TELEGRAM_BOT_TOKEN_BagFlipper9000"
    ["vc_shark_99"]="TELEGRAM_BOT_TOKEN_VCShark99"
    ["linda_evangelista_88"]="TELEGRAM_BOT_TOKEN_LindAEvangelista88"
)

# Start individual agent
start_agent() {
    local character=$1
    # Convert character name to match environment variable case
    local env_character
    case "$character" in
        "eth_memelord_9000") env_character="ETHMemeLord9000" ;;
        "bag_flipper_9000") env_character="BagFlipper9000" ;;
        "linda_evangelista_88") env_character="LindAEvangelista88" ;;
        "vc_shark_99") env_character="VCShark99" ;;
        "bitcoin_maxi_420") env_character="BitcoinMaxi420" ;;
        "code_samurai_77") env_character="CodeSamurai77" ;;
        *) env_character="$character" ;;
    esac
    
    local token_var="TELEGRAM_BOT_TOKEN_${env_character}"
    
    echo "🚀 Starting ${character}..."
    echo "📝 Using token variable: ${token_var}"
    
    # Source the .env file to ensure we have all variables
    set -a
    source .env
    set +a
    
    # Get the token value
    local token_value="${!token_var}"
    echo "📝 Token value: ${token_value}"
    
    if [ -z "${token_value}" ]; then
        echo "❌ Error: Token not found for ${character}"
        return 1
    fi
    
    # Export the token as TELEGRAM_BOT_TOKEN
    export TELEGRAM_BOT_TOKEN="${token_value}"
    
    # Start the agent with output going to both terminal and log file
    pnpm --filter "@elizaos/agent" start \
        --isRoot \
        --characters="characters/${character}.json" \
        --clients=@elizaos-plugins/client-telegram \
        --update-env \
        --log-level=debug 2>&1 | tee "logs/${character}.log" &
    
    local pid=$!
    echo "📝 PID: ${pid}"
    echo "${pid}" > "logs/${character}.pid"
    
    # Wait a moment to check if process is still running and show initial logs
    sleep 5
    if ! kill -0 $pid 2>/dev/null; then
        echo "⚠️  Warning: Bot may not have started properly. Check logs at $(pwd)/logs/${character}.log"
    else
        # Show the most relevant log lines about Telegram connection
        echo "📝 Recent connection logs:"
        tail -n 20 "logs/${character}.log" | grep -E "Telegram|Bot username|ERROR|WARN" || echo "No relevant log entries found"
    fi
    
    echo "✅ Done. Use './monitor_agents.sh' to check status"
}

# Usage information
show_usage() {
    echo "Usage: $0 [agent_name1 agent_name2 ...]"
    echo "Available agents:"
    for agent in "${!AGENTS[@]}"; do
        echo "  - $agent"
    done
    echo "Examples:"
    echo "  $0                          # Start all agents"
    echo "  $0 bitcoin_maxi_420        # Start only BTCMaxi"
    echo "  $0 bitcoin_maxi_420 eth_memelord_9000  # Start BTCMaxi and ETHMemeLord"
}

# Check for help flag
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Start specified agents or all if none specified
if [ $# -eq 0 ]; then
    echo "Starting all agents..."
    for character in "${!AGENTS[@]}"; do
        start_agent "$character"
    done
else
    for character in "$@"; do
        if [[ -v AGENTS[$character] ]]; then
            start_agent "$character"
        else
            echo "⚠️  Unknown agent: $character"
            show_usage
        fi
    done
fi

# Setup log rotation
cat > /etc/logrotate.d/eliza_agents << EOF
$LOG_DIR/*.log {
    size $ROTATE_SIZE
    rotate $ROTATE_COUNT
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF

echo "✅ Done. Use './monitor_agents.sh' to check status"