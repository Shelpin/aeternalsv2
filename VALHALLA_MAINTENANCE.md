# Valhalla Multi-Agent System Maintenance Guide

This document provides information about the Valhalla Multi-Agent System maintenance scripts and the fixes implemented to address connection and message handling issues.

## Available Scripts

The following scripts are available to manage the Valhalla system:

### Primary Scripts

- **`fix_and_restart.sh`**: The main script that applies all fixes and restarts the entire system. This is the recommended script to use when restarting the system.
  ```
  ./fix_and_restart.sh
  ```

- **`clean_restart.sh`**: Performs a complete cleanup of logs and processes before restarting the system.
  ```
  ./clean_restart.sh
  ```

- **`restart_valhalla.sh`**: Restarts the relay server and agents without a full cleanup.
  ```
  ./restart_valhalla.sh
  ```

### Utility Scripts

- **`test_valhalla.sh`**: Runs a comprehensive test suite for the Valhalla system to verify proper operation.
  ```
  ./test_valhalla.sh
  ```

- **`verifyFixes.sh`**: Verifies the fixes applied to a specific agent.
  ```
  ./verifyFixes.sh eth_memelord_9000_bot
  ```

- **`monitor_agents.sh`**: Monitors agent logs in real-time.
  ```
  ./monitor_agents.sh -w
  ```

- **`stop_agents.sh`**: Stops all running agent processes.
  ```
  ./stop_agents.sh all
  ```

- **`start_agents.sh`**: Starts all agent processes.
  ```
  ./start_agents.sh
  ```

- **`clear_logs.sh`**: Clears all log files.
  ```
  ./clear_logs.sh
  ```

## Implemented Fixes

The following fixes have been implemented to address connection and message handling issues:

1. **Agent Re-registration Logic**: 
   - Added improved health check and re-registration logic in the `ensureRelayConnection` method.
   - Agents now verify their registration status with the relay server and attempt to re-register if not found.

2. **Runtime Message Handler Check**:
   - Added a check for the existence of the `runtime.handleMessage` method to ensure proper message handling.
   - The system logs a warning if this method is not defined.

3. **Heartbeat Configuration**:
   - Added a configurable heartbeat interval (default: 10 seconds) to maintain active connections.
   - All scripts now properly configure and export the heartbeat interval.

4. **Plugin Configuration Standardization**:
   - All scripts now ensure the plugin configuration is properly set up with consistent settings.
   - Configuration includes proper relay server URL, authentication token, and heartbeat interval.

## Troubleshooting

### Agent Connection Issues

If agents fail to connect to the relay server:

1. Check the relay server logs:
   ```
   tail -f /root/eliza/logs/relay-server.log
   ```

2. Check the agent logs:
   ```
   tail -f /root/eliza/logs/<agent_name>.log
   ```

3. Verify the relay server is running:
   ```
   curl http://localhost:4000/health
   ```

4. Run the verification script:
   ```
   ./verifyFixes.sh <agent_name>
   ```

### Message Handling Issues

If agents are not properly handling messages:

1. Check the agent logs for any warnings about the runtime handler:
   ```
   grep "runtime handleMessage" /root/eliza/logs/<agent_name>.log
   ```

2. Verify the plugin configuration:
   ```
   cat /root/eliza/agent/config/plugins/telegram-multiagent.json
   ```

3. Test message passing using the test script:
   ```
   ./test_valhalla.sh
   ```

## System Architecture

The Valhalla Multi-Agent System consists of the following components:

1. **Relay Server**: Handles message routing between agents and external services.
2. **Agent Processes**: Individual AI agents with specific personas.
3. **Telegram Multi-Agent Plugin**: Connects agents to Telegram and handles message processing.

Each component must be properly configured and connected for the system to function correctly.

## Environment Variables

The scripts set the following environment variables:

- `HEARTBEAT_INTERVAL`: The interval in milliseconds for agent heartbeat checks (default: 10000).
- `RELAY_SERVER_URL`: The URL of the relay server (default: http://207.180.245.243:4000).
- `RELAY_AUTH_TOKEN`: The authentication token for the relay server.
- `TELEGRAM_GROUP_IDS`: The Telegram group IDs for the agents to monitor.

## Maintenance Recommendations

1. Always use the `fix_and_restart.sh` script when restarting the system to ensure all fixes are applied.
2. Monitor the logs regularly to check for any connection or message handling issues.
3. Run the `test_valhalla.sh` script after any system changes to verify functionality.
4. Keep backup copies of the plugin configuration files before making changes.
5. When updating the system, ensure the heartbeat configuration is maintained. 