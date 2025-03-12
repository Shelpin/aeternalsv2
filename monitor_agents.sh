#!/bin/bash

LOG_DIR="/root/eliza/logs"
AUTO_RESTART=true

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Agent definitions
declare -A AGENTS=(
    ["bitcoin_maxi_420"]="TELEGRAM_BOT_TOKEN_BitcoinMaxi420"
    ["eth_memelord_9000"]="TELEGRAM_BOT_TOKEN_ETHMemeLord9000"
    ["code_samurai_77"]="TELEGRAM_BOT_TOKEN_CodeSamurai77"
    ["bag_flipper_9000"]="TELEGRAM_BOT_TOKEN_BagFlipper9000"
    ["vc_shark_99"]="TELEGRAM_BOT_TOKEN_VCShark99"
    ["linda_evangelista_88"]="TELEGRAM_BOT_TOKEN_LindAEvangelista88"
)

check_agent() {
    local character=$1
    local token_var=$2
    local pid_file="$LOG_DIR/${character}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null; then
            echo -e "${GREEN}✓${NC} $character (PID: $pid) is running"
            return 0
        else
            echo -e "${RED}✗${NC} $character (PID: $pid) is not running"
            if [ "$AUTO_RESTART" = true ]; then
                echo -e "${YELLOW}⟲${NC} Restarting $character..."
                rm "$pid_file"
                setsid TELEGRAM_BOT_TOKEN=${!token_var} pnpm --filter "@elizaos/agent" start \
                    --isRoot \
                    --characters="characters/${character}.json" \
                    --clients=@elizaos-plugins/client-telegram \
                    --update-env \
                    --log-level=debug > "$LOG_DIR/${character}.log" 2>&1 &
                echo $! > "$pid_file"
                echo -e "${GREEN}✓${NC} $character restarted with PID: $!"
            fi
            return 1
        fi
    else
        echo -e "${RED}✗${NC} $character has no PID file"
        return 1
    fi
}

show_usage() {
    echo "Usage: $0 [options] [agent_name1 agent_name2 ...]"
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -l, --logs     Show recent logs"
    echo "  -n, --no-restart  Disable auto-restart"
    echo "Available agents:"
    for agent in "${!AGENTS[@]}"; do
        echo "  - $agent"
    done
}

# Process options
SHOW_LOGS=false
while [[ "$1" =~ ^- ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -l|--logs)
            SHOW_LOGS=true
            shift
            ;;
        -n|--no-restart)
            AUTO_RESTART=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Monitor specified agents or all if none specified
echo "🔍 Checking agent status..."
if [ $# -eq 0 ]; then
    for character in "${!AGENTS[@]}"; do
        check_agent "$character" "${AGENTS[$character]}"
    done
else
    for character in "$@"; do
        if [[ -v AGENTS[$character] ]]; then
            check_agent "$character" "${AGENTS[$character]}"
        else
            echo "⚠️  Unknown agent: $character"
            show_usage
        fi
    done
fi

# Show logs if requested
if [ "$SHOW_LOGS" = true ]; then
    echo -e "\n📊 Recent log entries:"
    for character in "${!AGENTS[@]}"; do
        if [ $# -eq 0 ] || [[ " $* " =~ " $character " ]]; then
            echo -e "\n${YELLOW}=== $character ===${NC}"
            tail -n 5 "$LOG_DIR/${character}.log" 2>/dev/null || echo "No recent logs"
        fi
    done
fi

echo -e "\n💡 Tips:"
echo "- View full logs: tail -f $LOG_DIR/<agent_name>.log"
echo "- Stop agents: ./stop_agents.sh"
echo "- Restart all: ./stop_agents.sh && ./start_agents.sh"
