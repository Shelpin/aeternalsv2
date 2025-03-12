#!/bin/bash

LOG_DIR="/root/eliza/logs"

# Agent definitions
declare -A AGENTS=(
    ["bitcoin_maxi_420"]="TELEGRAM_BOT_TOKEN_BitcoinMaxi420"
    ["eth_memelord_9000"]="TELEGRAM_BOT_TOKEN_ETHMemeLord9000"
    ["code_samurai_77"]="TELEGRAM_BOT_TOKEN_CodeSamurai77"
    ["bag_flipper_9000"]="TELEGRAM_BOT_TOKEN_BagFlipper9000"
    ["vc_shark_99"]="TELEGRAM_BOT_TOKEN_VCShark99"
    ["linda_evangelista_88"]="TELEGRAM_BOT_TOKEN_LindAEvangelista88"
)

stop_agent() {
    local character=$1
    local pid_file="$LOG_DIR/${character}.pid"
    local found_process=false
    
    # First try to stop by PID file
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null; then
            echo "🛑 Stopping $character (PID: $pid) from PID file..."
            kill -15 $pid # Graceful shutdown
            sleep 2
            if ps -p $pid > /dev/null; then
                kill -9 $pid # Force if still running
            fi
            rm "$pid_file"
            echo "✓ Stopped $character from PID file"
            found_process=true
        else
            echo "⚠️  PID file exists but process was not running"
            rm "$pid_file"
        fi
    fi
    
    # Then find and stop any processes by character name
    for pid in $(ps aux | grep "characters/${character}.json" | grep -v grep | awk '{print $2}'); do
        echo "🛑 Stopping additional $character process (PID: $pid)..."
        kill -15 $pid # Graceful shutdown
        sleep 2
        if ps -p $pid > /dev/null; then
            kill -9 $pid # Force if still running
        fi
        found_process=true
        echo "✓ Stopped additional process"
    done
    
    if [ "$found_process" = false ]; then
        echo "ℹ️  No running processes found for $character"
    fi
    
    # Clean up any leftover PID files
    rm -f "$pid_file"
}

show_usage() {
    echo "Usage: $0 [options] [agent_name1 agent_name2 ...]"
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -f, --force    Force kill agents"
    echo "Available agents:"
    for agent in "${!AGENTS[@]}"; do
        echo "  - $agent"
    done
}

# Process options
FORCE=false
while [[ "$1" =~ ^- ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Stop specified agents or all if none specified
if [ $# -eq 0 ]; then
    echo "Stopping all agents..."
    for character in "${!AGENTS[@]}"; do
        stop_agent "$character"
    done
else
    for character in "$@"; do
        if [[ -v AGENTS[$character] ]]; then
            stop_agent "$character"
        else
            echo "⚠️  Unknown agent: $character"
            show_usage
        fi
    done
fi

echo "✅ Done"