# Build Madness: Fixing ElizaOS Agent Integration

## Executive Summary

This document chronicles our journey to fix the ElizaOS agent system after restructuring the TelegramClient package. Despite seemingly successful restructuring of the client code, the agents weren't registering with the relay server. The root cause was traced to several issues including incorrect package locations, dependency resolution problems, and path mismatches.

## 1. Initial Problem Detection

The launch_valhalla.sh script was failing to start the agents properly, with no agents registering with the relay server:

```
[9] Verifying agent registration with relay...
   Agents registered: 0
   Agents list: 
   Warning: Not all agents are registered with the relay server.
   Expected 6 agents, but only 0 are registered.
   Check agent logs for connection issues.
```

## 2. Root Cause Analysis

### 2.1 Agent Package Location

**Issue:** The agent package was not in the expected `packages/agent` directory, causing workspace resolution failures.

**Investigation:** 
Checked the package structure and found the agent at the root level:
```bash
ls -la
# Found agent/ directory in root instead of packages/agent/
```

**Fix:** Moved the agent package into the packages directory:
```bash
mkdir -p /root/eliza/packages/agent && cp -r /root/eliza/agent/* /root/eliza/packages/agent/
```

### 2.2 Workspace Configuration

**Issue:** The pnpm-workspace.yaml file didn't correctly include the agent package.

**Before:**
```yaml
packages:
  - packages/*
  - packages/clients/*
```

**Fix:** Updated workspace configuration:
```yaml
packages:
  - 'packages/*'
  - 'packages/clients/*'
  - 'packages/plugins/*'
  - 'packages/agent'
```

### 2.3 Package Name Mismatch

**Issue:** The agent package referenced the old client package name `@elizaos-plugins/client-telegram` instead of the new name `@elizaos/client-telegram`.

**Fix:** Updated package.json:
```diff
"dependencies": {
-   "@elizaos-plugins/client-telegram": "^0.1.0",
+   "@elizaos/client-telegram": "^0.1.0",
    "@elizaos-plugins/plugin-coingecko": "github:elizaos-plugins/plugin-coingecko",
    ...
}
```

### 2.4 Reference Path Errors

**Issue:** The tsconfig.json file in the agent package had an incorrect path reference.

**Before:**
```json
{
    "extends": "../packages/core/tsconfig.json",
    ...
}
```

**Fix:**
```json
{
    "extends": "../core/tsconfig.json",
    ...
}
```

## 3. Dependency Building Challenges

When trying to run the agent manually, we encountered several missing dependency issues:

### 3.1 Dependency Build Order Problem

**Error:**
```
Error: Cannot find module '/root/eliza/packages/agent/node_modules/@elizaos/client-direct/dist/index.js' imported from /root/eliza/packages/agent/src/index.ts
```

**Fix:** Manually built each dependency in order:
```bash
cd /root/eliza/packages/client-direct && pnpm build
cd /root/eliza/packages/core && pnpm build
cd /root/eliza/packages/plugin-bootstrap && pnpm build
cd /root/eliza/packages/telegram-multiagent && pnpm build
```

### 3.2 Character File Path Resolution

**Error:**
```
[2025-03-29 15:40:27] ERROR: Error loading character from characters/eth_memelord_9000.json: File not found in any of the expected locations
...
[2025-03-29 15:40:27] ERROR:  - /root/eliza/packages/agent/characters/eth_memelord_9000.json
...
```

**Solution:** Used absolute paths for character files:
```bash
pnpm --filter @elizaos/agent start --isRoot --character=/root/eliza/characters/eth_memelord_9000.json ...
```

### 3.3 Launch Script Commands

**Issue:** The launch script was not using absolute paths and didn't include the `--isRoot` flag.

**Before:**
```bash
pnpm --filter @elizaos/agent start --character="characters/${agent}.json" \
      --clients=@elizaos/client-telegram \
      --plugins=@elizaos/telegram-multiagent \
      --log-level=debug \
      --port=$PORT > $LOG_DIR/${agent}.log 2>&1 &
```

**After:**
```bash
cd /root/eliza && pnpm --filter @elizaos/agent start --isRoot \
  --character="characters/${agent}.json" \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --log-level=debug \
  --port=$PORT > $LOG_DIR/${agent}.log 2>&1 &
```

## 4. Build Process Validation

After applying fixes, we ran build verification commands:

```bash
pnpm store prune
pnpm install --no-frozen-lockfile
pnpm list --filter @elizaos/agent
```

Output confirmed the agent package was correctly visible to pnpm:
```
@elizaos/agent@0.25.9 /root/eliza/packages/agent

dependencies:
@elizaos-plugins/plugin-coingecko 0.1.9
...
@elizaos/client-telegram 0.1.9
@elizaos/core link:../core
...
```

## 5. Database Path Corrections

### 5.1 Agent Database Path

**Issue:** The root package.json scripts referenced the old agent database location.

**Fix:** Updated all references:
```diff
- "cleanstart": "if [ -f agent/data/db.sqlite ]; then rm agent/data/db.sqlite; fi && pnpm --filter \"@elizaos/agent\" start --isRoot",
+ "cleanstart": "if [ -f packages/agent/data/db.sqlite ]; then rm packages/agent/data/db.sqlite; fi && pnpm --filter \"@elizaos/agent\" start --isRoot",
```

### 5.2 Launch Script Database Cleanup

**Issue:** Database cleanup in launch_valhalla.sh used old paths.

**Fix:**
```diff
- rm -f ./agent/data/*.db
- rm -f ./agent/data/*.sqlite
+ rm -f ./packages/agent/data/*.db
+ rm -f ./packages/agent/data/*.sqlite
```

## 6. Current State and Remaining Issues

### 6.1 Agent Startup

The agent now starts successfully when using the absolute path to character files:
```bash
pnpm --filter @elizaos/agent start --isRoot --character=/root/eliza/characters/eth_memelord_9000.json ...
```

Verification that the agent process is running:
```
root     1215395 26.8  1.8 10281600 371160 pts/22 Sl+ 16:40   0:20 node --loader ts-node/esm src/index.ts --isRoot --character=/root/eliza/characters/eth_memelord_9000.json ...
```

### 6.2 Relay Server Communication

Despite the agent starting successfully, it still doesn't register with the relay server:
```
curl -s http://localhost:4000/health
{"status":"ok","agents":0,"agents_list":[],"agents_details":[],"uptime":1554.204811983,"timestamp":"2025-03-
```

### 6.3 Database Schema Initialization

The database schema is still being initialized at the old location:
```
[DB INIT] Initializing database: ./agent/data/telegram-multiagent.db
```

## 7. Recommendations for Next Steps

Based on our findings, we recommend:

1. **Build Dependency Chain:**
   - Add a comprehensive build step in the launch script that builds all dependencies in the correct order

2. **Use Absolute Paths:**
   - Update all character file references in launch_valhalla.sh to use absolute paths:
   ```bash
   --character="/root/eliza/characters/${agent}.json"
   ```

3. **Fix Database Initialization:**
   - Update the init_database.js script to use the new agent path

4. **Debug Relay Communications:**
   - Inspect agent logs for relay connection errors
   - Verify that the environment variables for relay server connection are correctly set

5. **Add Workspace Validation:**
   - Implement a pre-launch validation step to ensure all packages are accessible

6. **Create Build Script:**
   - Create a dedicated script to build all packages in the proper dependency order

## 8. Conclusion

The restructuring of the TelegramClient package exposed several systemic issues in the project's package management and path resolution. While we've resolved many of these issues, there remain challenges with agent-relay communication and database initialization. The root cause appears to be a combination of workspace structure changes and path resolution inconsistencies. With the fixes applied, we're closer to a fully operational system, but additional debugging of the relay registration process is needed. 