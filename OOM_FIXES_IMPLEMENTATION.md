# OOM Fixes Implementation Guide

This document details the implementation of fixes for the Out of Memory (OOM) issues affecting the Valhalla multi-agent system.

## Root Cause Summary

The primary cause of OOM errors (exit code 137) was:

1. **Dual Polling**: Both TelegramMultiAgentPlugin and TelegramRelay were polling simultaneously, causing duplicate resource drain
2. **Unreleased Memory**: AbortController and fetch memory leakage
3. **No Garbage Collection**: Node.js wasn't running garbage collection frequently enough

## Implemented Fixes

### 1. Disable Polling in TelegramMultiAgentPlugin

The `DISABLE_POLLING=true` environment variable now prevents the plugin from running its own polling loop, letting the relay handle all polling. This was implemented in:
- TelegramMultiAgentPlugin.ts - Added checks for the environment variable in `startRelayPolling()`
- TelegramRelay.ts - Added similar checks in the `connect()` method

### 2. Memory Management Improvements

- Set `--max-old-space-size=512` to limit Node.js heap memory
- Used `--expose-gc` to enable explicit garbage collection
- Added `FORCE_GC=true` environment variable to trigger garbage collection after each polling operation
- Created individual GC scripts (gc_*.js) for each agent to periodically run garbage collection

### 3. Launch Script Enhancements

Created `launch_valhalla.sh` with the following improvements:
- Sets all required environment variables
- Properly cleans up existing processes before starting
- Launches the relay server with correct port
- Starts agents with staggered launch (10 second delays)
- Verifies agent registration with the relay
- Provides monitoring commands for debugging

## How to Use the Fixed System

### Starting the System

```bash
./launch_valhalla.sh
```

This script:
1. Stops any existing processes
2. Cleans port assignments
3. Sets up required environment variables
4. Starts the relay server
5. Launches GC helper scripts
6. Starts all agents with proper memory limits
7. Verifies agent registration

### Monitoring

You can monitor the system using:

```bash
# View all logs
tail -f logs/*.log

# View relay server logs
tail -f logs/relay-server.log

# View memory usage
ps aux --sort -rss | grep node

# Check relay health
curl http://localhost:4000/health
```

### Stopping the System

To stop all agents and the relay server:

```bash
./stop_agents.sh all
pkill -f "node.*server.js"
```

## Memory Usage Expectations

With these fixes in place, memory usage should:
- Remain stable below ~200MB per agent
- Not grow continuously over time
- No longer lead to OOM crashes (exit code 137)

## Troubleshooting

If you still encounter OOM issues:

1. Verify that `DISABLE_POLLING=true` is set for all agents
2. Check that all GC scripts are running (`ps aux | grep gc_`)
3. Examine agent logs for any polling-related errors
4. Consider reducing the number of agents if memory pressure remains high
5. Increase stagger time between agent launches (currently 10 seconds)

## Conclusion

The implementation of these fixes addresses the core memory management issues in the Valhalla system. By eliminating dual polling and improving garbage collection, the system should now operate stably without running into OOM errors. 