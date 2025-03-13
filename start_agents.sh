#!/bin/bash

# Secure bash settings
set -o nounset  # Exit when undefined variables
set -o pipefail # Properly handle pipe command failures

# Configuration
LOG_DIR="/root/eliza/logs"
PORT_DIR="/root/eliza/ports"
mkdir -p $LOG_DIR
mkdir -p $PORT_DIR

# Port range for agents
PORT_RANGE_START=3000
PORT_RANGE_END=4000

# Agent definitions with token variables (no hardcoded ports)
declare -A AGENTS=(
    ["bitcoin_maxi_420"]="TELEGRAM_BOT_TOKEN_BitcoinMaxi420"
    ["eth_memelord_9000"]="TELEGRAM_BOT_TOKEN_ETHMemeLord9000"
    ["code_samurai_77"]="TELEGRAM_BOT_TOKEN_CodeSamurai77"
    ["bag_flipper_9000"]="TELEGRAM_BOT_TOKEN_BagFlipper9000"
    ["vc_shark_99"]="TELEGRAM_BOT_TOKEN_VCShark99"
    ["linda_evangelista_88"]="TELEGRAM_BOT_TOKEN_LindAEvangelista88"
)

# Security: Function to validate input strings
validate_input() {
    local input="$1"
    # Check for potentially dangerous characters
    if [[ "$input" == *";"* || "$input" == *"|"* || "$input" == *">"* || "$input" == *"<"* || "$input" == *"&"* ]]; then
        echo "⚠️ Security warning: Invalid characters detected in input" >&2
        return 1
    fi
    return 0
}

# Function to check if a port is available
check_port() {
    local port="$1"
    
    # Security: Validate port number
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        echo "⚠️ Invalid port number: $port" >&2
        return 1
    fi
    
    if lsof -i:"$port" -t >/dev/null 2>&1; then
        return 1
    else
        return 0
    fi
}

# Function to find the next available port
find_available_port() {
    local character="$1"
    local previous_port=0
    
    # Check if this agent had a previous port assignment
    local port_file="${PORT_DIR}/${character}.port"
    if [ -f "$port_file" ]; then
        # First try to parse with PORT= prefix (new format)
        if grep -q "^PORT=" "$port_file"; then
            previous_port=$(grep "^PORT=" "$port_file" | cut -d '=' -f2 | tr -d '[:space:]')
        else
            # Fall back to old format (just the number on first line)
            previous_port=$(head -n 1 "$port_file" | tr -d '[:space:]')
        fi
        
        # Validate it's a number
        if [[ "$previous_port" =~ ^[0-9]+$ ]] && [ "$previous_port" -ge "$PORT_RANGE_START" ] && [ "$previous_port" -le "$PORT_RANGE_END" ]; then
            # Check if the previous port is still available
            if check_port "$previous_port"; then
                echo "🔄 Reusing previous port $previous_port for $character" >&2
                echo "$previous_port"
                return 0
            else
                echo "⚠️ Previous port $previous_port for $character is now in use by another process" >&2
                # Try to identify what is using the port
                local port_pid
                port_pid=$(lsof -i:"$previous_port" -t 2>/dev/null)
                if [ -n "$port_pid" ]; then
                    local process_name
                    process_name=$(ps -p "$port_pid" -o comm= 2>/dev/null)
                    echo "   Port $previous_port is being used by process $port_pid ($process_name)" >&2
                fi
            fi
        else
            echo "⚠️ Invalid previous port $previous_port in port file for $character" >&2
        fi
    fi
    
    # Always try to assign a deterministic port for this agent based on its position in the AGENTS array
    # This helps ensure the same agent gets the same port in a fresh start
    local agent_position=0
    local total_agents=${#AGENTS[@]}
    local i=0
    
    for agent in "${!AGENTS[@]}"; do
        if [ "$agent" = "$character" ]; then
            agent_position=$i
            break
        fi
        ((i++))
    done
    
    # Calculate preferred port based on agent position
    local preferred_port=$((PORT_RANGE_START + agent_position))
    
    # Check if preferred port is available
    if [ "$preferred_port" -ge "$PORT_RANGE_START" ] && [ "$preferred_port" -le "$PORT_RANGE_END" ]; then
        if check_port "$preferred_port"; then
            echo "🔄 Using preferred port $preferred_port for $character" >&2
            echo "$preferred_port"
            return 0
        else
            echo "⚠️ Preferred port $preferred_port for $character is already in use" >&2
        fi
    fi
    
    # If previous or preferred port is not available, find a new one
    # Start from the beginning of the range
    for port in $(seq $PORT_RANGE_START $PORT_RANGE_END); do
        # Security: Validate port number
        if ! [[ "$port" =~ ^[0-9]+$ ]]; then
            continue
        fi
        
        if check_port "$port"; then
            echo "🔄 Assigning new port $port for $character" >&2
            echo "$port"
            return 0
        fi
    done
    
    echo "0" # No available ports found
    return 1
}

# Function to mask token for display (show first 3 and last 3 digits)
mask_token() {
    local token="$1"
    local token_length=${#token}
    
    if [ "$token_length" -le 10 ]; then
        echo "***" # Token too short to mask meaningfully
    else
        local first_three=${token:0:3}
        local last_three=${token: -3}
        echo "${first_three}...${last_three}"
    fi
}

# Function to secure file permissions
secure_files() {
    # Secure .env file
    if [ -f .env ]; then
        chmod 600 .env
    fi
    
    # Secure log directory
    chmod 750 "$LOG_DIR"
    
    # Secure port directory
    chmod 750 "$PORT_DIR"
}

# Start individual agent
start_agent() {
    local character="$1"
    
    # Security: Validate character name
    if ! [[ "$character" =~ ^[a-zA-Z0-9_]+$ ]]; then
        echo "⚠️ Invalid character name format: $character" >&2
        return 1
    fi
    
    local token_var="${AGENTS[$character]}"
    
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
    
    echo "🚀 Starting ${character}..."
    echo "📝 Using token variable: ${token_var}"
    
    # Check if agent is already running
    if [ -f "$LOG_DIR/${character}.pid" ]; then
        local existing_pid
        existing_pid=$(cat "$LOG_DIR/${character}.pid")
        
        # Security: Validate PID is numeric
        if ! [[ "$existing_pid" =~ ^[0-9]+$ ]]; then
            echo "⚠️ Invalid PID in PID file for $character"
            rm -f "$LOG_DIR/${character}.pid"
        elif ps -p "$existing_pid" > /dev/null 2>&1; then
            echo "⚠️ Agent ${character} is already running (PID: ${existing_pid})"
            return 0
        else
            echo "🔄 Removing stale PID file for ${character}"
            rm -f "$LOG_DIR/${character}.pid"
        fi
    fi
    
    # Source the .env file to ensure we have all variables
    if [ ! -f .env ]; then
        echo "❌ Error: .env file not found!"
        return 1
    fi
    
    # Security: Use a subshell to avoid leaking variables
    local token_masked
    local token_value
    
    # Read token in a subshell to avoid leaking it to environment
    token_info=$(
        set -a
        # shellcheck source=/dev/null
        source .env
        set +a
        
        # Get the token value
        token_value="${!token_var}"
        
        if [ -z "$token_value" ]; then
            echo "ERROR|Token not found"
            exit 1
        fi
        
        # Generate masked token for display
        masked_token=$(mask_token "$token_value")
        echo "OK|$masked_token|$token_value"
    )
    
    # Parse the token info
    IFS='|' read -r token_status token_masked token_value <<< "$token_info"
    
    if [ "$token_status" != "OK" ]; then
        echo "❌ Error: Token not found for ${character}. Check your .env file."
        return 1
    fi
    
    # Show masked token for verification
    echo "🔑 Using bot token: ${token_masked}"
    
    # Find available port
    local port
    port=$(find_available_port "$character")
    if [ "$port" = "0" ]; then
        echo "❌ Error: No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}"
        return 1
    fi
    
    echo "🔌 Assigning port: ${port}"
    
    # Export variables (only in this process, not leaked to environment)
    export TELEGRAM_BOT_TOKEN="${token_value}"
    export HTTP_PORT="${port}"
    
    # Save port assignment to file, preserving JSON content if it exists
    if grep -q "^{" "${PORT_DIR}/${character}.port" 2>/dev/null; then
        # Extract JSON part
        json_content=$(sed -n '/^{/,$p' "${PORT_DIR}/${character}.port")
        # Write port with JSON content
        echo "PORT=${port}" > "${PORT_DIR}/${character}.port"
        echo "" >> "${PORT_DIR}/${character}.port"
        echo "$json_content" >> "${PORT_DIR}/${character}.port"
    else
        # Just write the port if no JSON content exists
        echo "PORT=${port}" > "${PORT_DIR}/${character}.port"
    fi
    chmod 640 "${PORT_DIR}/${character}.port"
    
    # Create empty log file if it doesn't exist
    touch "$LOG_DIR/${character}.log"
    chmod 640 "$LOG_DIR/${character}.log"
    
    # Start the agent with output going to both terminal and log file
    echo "📡 Starting agent process..."
    # Use setsid to create a new session for the agent process to prevent it from receiving parent script's signals
    setsid pnpm --filter "@elizaos/agent" start \
        --isRoot \
        --characters="characters/${character}.json" \
        --clients=@elizaos-plugins/client-telegram \
        --update-env \
        --log-level=debug \
        --port="${port}" >> "logs/${character}.log" 2>&1 &
    
    local pid=$!
    echo "📝 Initial PID: ${pid}"
    
    # Wait a moment for the process to start
    sleep 3
    
    # Find the actual agent process PID (child of the setsid process or its own process group)
    local actual_pid
    actual_pid=$(pgrep -f "characters/${character}.json" | head -n 1)
    
    if [ -n "$actual_pid" ]; then
        echo "📝 Actual agent PID: ${actual_pid}"
        pid=$actual_pid
    else
        echo "⚠️ Could not determine actual agent PID, using initial PID"
    fi
    
    # Security: Set restrictive permissions on PID file
    echo "${pid}" > "logs/${character}.pid"
    chmod 640 "logs/${character}.pid"
    
    # Wait to check if process is still running
    echo "⏳ Waiting for agent to initialize..."
    sleep 10
    if ! ps -p $pid > /dev/null 2>&1; then
        echo "⚠️ Warning: Agent ${character} failed to start properly."
        echo "⚠️ Check logs at $(pwd)/logs/${character}.log"
        rm -f "logs/${character}.pid"
        # Do not remove the port file - we need to preserve port assignments
        # rm -f "${PORT_DIR}/${character}.port"
        return 1
    fi
    
    # Verify the actual port being used by the process
    local actual_port
    actual_port=$(lsof -p $pid -a -i tcp -sTCP:LISTEN -n -P 2>/dev/null | grep LISTEN | awk '{print $9}' | sed 's/.*://')
    if [ -n "$actual_port" ] && [ "$actual_port" != "$port" ]; then
        echo "⚠️ Warning: Assigned port ($port) differs from actual port in use ($actual_port)"
        echo "$actual_port" > "${PORT_DIR}/${character}.port"
        chmod 640 "${PORT_DIR}/${character}.port"
        echo "🔄 Updated port assignment to $actual_port"
    elif [ -z "$actual_port" ]; then
        echo "⚠️ Warning: Could not verify if agent is listening on port $port"
    else
        echo "✅ Verified agent is listening on assigned port $port"
    fi
    
    # Log start success with actual port if available
    if [ -n "$actual_port" ]; then
        echo "✅ Agent ${character} started successfully on port ${actual_port} with PID ${pid}"
        echo "$(date +'%Y-%m-%d %H:%M:%S') - Started ${character} on port ${actual_port} with PID ${pid}" >> "$LOG_DIR/agent_operations.log"
    else
        echo "✅ Agent ${character} started successfully on port ${port} with PID ${pid}"
        echo "$(date +'%Y-%m-%d %H:%M:%S') - Started ${character} on port ${port} with PID ${pid}" >> "$LOG_DIR/agent_operations.log"
    fi
    
    # Unset sensitive environment variables
    unset TELEGRAM_BOT_TOKEN
    
    return 0
}

# Usage information
show_usage() {
    echo "Usage: $0 [options] [agent_name1 agent_name2 ...]"
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -s, --secure   Run with extra security checks"
    echo "Available agents:"
    for agent in "${!AGENTS[@]}"; do
        echo "  - $agent"
    done
    echo "Examples:"
    echo "  $0                          # Start all agents"
    echo "  $0 bitcoin_maxi_420        # Start only BitcoinMaxi"
    echo "  $0 bitcoin_maxi_420 eth_memelord_9000  # Start BitcoinMaxi and ETHMemeLord"
    echo "  $0 -s                       # Run with extra security"
}

# Main function
main() {
    # Process command line options
    local SECURE_MODE=false
    
    while [[ "${1:-}" =~ ^- ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -s|--secure)
                SECURE_MODE=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate requirements
    command -v lsof >/dev/null 2>&1 || { 
        echo "❌ Error: lsof is required but not installed. Please install it using 'apt-get install lsof'"
        exit 1 
    }
    
    # Apply security checks if requested
    if [ "$SECURE_MODE" = true ]; then
        echo "🔒 Running in secure mode - applying security measures..."
        secure_files
        
        # Check for exposed tokens in environment
        if printenv | grep -q "TELEGRAM_BOT_TOKEN"; then
            echo "⚠️ Security warning: TELEGRAM_BOT_TOKEN already set in environment"
            echo "   This could lead to token leakage. Consider unsetting it first."
        fi
        
        # Check for proper permissions
        if [ -f .env ] && [ "$(stat -c %a .env)" != "600" ]; then
            echo "⚠️ Security issue: .env file has insecure permissions: $(stat -c %a .env)"
            chmod 600 .env
            echo "✅ Fixed .env permissions"
        fi
    fi
    
    # Security: Validate agent names in arguments
    local VALID_AGENTS=()
    
    for arg in "$@"; do
        # Validate character name format
        if ! [[ "$arg" =~ ^[a-zA-Z0-9_]+$ ]]; then
            echo "⚠️ Security warning: Invalid agent name format: $arg"
            continue
        fi
        
        # Check if agent exists
        if [[ -v AGENTS[$arg] ]]; then
            VALID_AGENTS+=("$arg")
        else
            echo "⚠️ Unknown agent: $arg"
        fi
    done
    
    # Start specified agents or all if none specified
    if [ ${#VALID_AGENTS[@]} -eq 0 ] && [ $# -eq 0 ]; then
        echo "Starting all agents..."
        local success_count=0
        local fail_count=0
        
        for character in "${!AGENTS[@]}"; do
            if start_agent "$character"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
            # Add a small delay between starts to prevent resource spikes
            sleep 2
        done
        
        echo "✅ Started ${success_count} agents successfully"
        if [ $fail_count -gt 0 ]; then
            echo "⚠️ Failed to start ${fail_count} agents"
        fi
    elif [ ${#VALID_AGENTS[@]} -gt 0 ]; then
        for character in "${VALID_AGENTS[@]}"; do
            start_agent "$character"
        done
    else
        echo "⚠️ No valid agents specified"
        show_usage
        exit 1
    fi
    
    echo -e "✅ Done. Use './monitor_agents.sh' to check status"
    echo -e "📊 View logs in real-time: ./monitor_agents.sh -w"
    echo -e "📊 View activity logs: ./monitor_agents.sh -w -a"
}

# Run the main function with all arguments
main "$@"