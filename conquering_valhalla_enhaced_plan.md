Valhalla Conquer: Enhanced Debugging Action Plan
This comprehensive plan updates and validates the phased debugging strategy for the ElizaOS Valhalla multi-agent Telegram bot system. It addresses all known blockers and adds defensive diagnostics to ensure a stable, fully functional deployment. The system runs on a non-Dockerized VPS (20GB RAM, 8 cores) and coordinates six Telegram-based AI agents through a patched runtime and a relay server. All commands below are shell-executable, and configuration keys match exactly what the system expects.
📋 Overview of Issues and Fixes
We tackle the following areas:
Runtime Patching & Initialization – Ensure the ElizaOS runtime is properly patched and the Telegram client is injected globally for all agents.
Relay Server Setup – Ensure the relay server is running on the correct port (default 4000) with no conflicts, to facilitate bot-to-bot communication (bots cannot see each other’s messages directly via Telegram).
Character File Path Resolution – Ensure all character JSON files (agent profiles) are in the expected locations to prevent startup failures.
Agent Startup & Configuration – Ensure each agent launches with correct environment variables (especially Telegram bot tokens) and no ts-node/ESM or lockfile issues. Include workarounds for any ts-node loader problems and missing build artifacts.
Database Initialization (SQLite) – Use in-memory databases or correct file paths to avoid SQLITE_ERROR connection issues.
Bot-to-Bot Communication – Verify that messages are relayed between agents either via the relay server or direct API fallbacks. Implement diagnostics for race conditions, message delivery failures, and ensure the system can handle communication reliably.
Global Injection in Plugin – Fix and validate that the Telegram client and bot tokens are accessible within the TelegramMultiAgentPlugin context for each agent (addresses bot token access and client visibility blockers).
Performance & Stability – Check for race conditions in startup timing, monitor memory usage to detect leaks or excessive garbage collection pauses, and ensure heartbeat signals and logging remain normal under load.
Ports, Environment & Paths – Verify that all required ports are free or properly allocated, all necessary environment variables are set, and all filesystem paths (logs, data, config) exist or are created as needed.
Phased Validation – Each phase includes success criteria and verification commands. If a phase fails its checks, troubleshoot using the provided diagnostics before proceeding.
🧪 Phase 1: Environment Preparation and Verification
In this phase, we clean up any previous runs, apply known code fixes, ensure dependencies are installed and built, and verify that configuration files are in place. This prevents leftover state or missing components from causing issues in later phases.
1.1 System Reset (Clean Processes, Ports, and Files)
Kill any running Valhalla processes, free up ports, and reset logs and database files to start fresh:
bash
Copy
Edit
# Kill all running ElizaOS processes (without killing the cursor connection processes)
pkill -f "node server.js" || true
pkill -f "start-agent" || true
pkill -f "start-agent-with-patches" || true

# Free up ports 3000-3005 (agents) and 4000 (relay) to avoid conflicts
for port in {3000..3005} 4000; do
  fuser -k "$port/tcp" 2>/dev/null || true
done

# Clean up any SQLite database files from previous runs
rm -rf /root/eliza/data/*.sqlite /root/eliza/data/*.sqlite-shm /root/eliza/data/*.sqlite-wal
mkdir -p /root/eliza/data  # Ensure data directory exists

# Rotate/clear logs for a fresh start
mkdir -p /root/eliza/logs
rm -f /root/eliza/logs/*.log
touch /root/eliza/logs/debug.log  # initialize a general debug log
Expected Results:
✅ All old agent and relay processes are terminated. Running ps should show no server.js or start-agent processes.
✅ Ports 3000-3005 and 4000 are free (no service should be listening; using lsof -i:<port> should return nothing for those ports).
✅ The /root/eliza/data directory exists and is empty of SQLite files (we will use in-memory DB, but this ensures no stale files interfere).
✅ The /root/eliza/logs directory is ready for new log output (old logs cleared to avoid confusion).
If any process remains (e.g., fuser still shows a port in use), you may need to adjust the kill command or investigate the lingering process. Ensure you run the cleanup as root or a user with sufficient privileges.
1.2 Dependency Verification (Node, TypeScript, Builds)
Verify that the system has the correct Node.js version and all necessary packages (especially the Telegram client) are present and properly built:
bash
Copy
Edit
# Check Node.js version (ElizaOS requires Node.js v23+ for ESM support)
node --version  # Expect v23.x or higher
# If version is lower, stop and install the required Node.js version before continuing.

# Verify ts-node is installed (to handle TypeScript at runtime if needed)
npm ls ts-node -g 2>/dev/null
npm ls ts-node 2>/dev/null
# If ts-node is not found or an old version, consider installing globally: npm install -g ts-node

# Verify core build artifacts exist
ls -la /root/eliza/packages/core/dist/  # Should list compiled .js files

# Verify Telegram client package is present (ensures @elizaos/client-telegram built)
ls -la /root/eliza/packages/clients/telegram/
# If this directory is empty or missing expected files, we will build it next.

# Verify Direct client package presence (for direct API fallback)
ls -la /root/eliza/packages/clients/direct/
# If missing distribution files, we'll build it in the next step.
Expected Results:
✅ Node.js version: The output of node --version should be v23.x or above. If it’s not, upgrade Node.js before proceeding (the system might fail to run ESM modules on older versions).
✅ ts-node presence: The npm ls ts-node commands should list a version (either globally or locally). If not, you may encounter issues with TypeScript execution; install it as needed.
✅ Core package built: The core/dist directory should contain compiled files (e.g., .js or .cjs files). If empty, it means the core package isn’t built – you would need to run the build for @elizaos/core.
✅ Telegram client package: The clients/telegram directory should exist. If there is a dist/ subdirectory, it should have files (indicating the Telegram client is built). If missing, we will build it.
✅ Direct client package: The clients/direct directory should exist. If it contains no dist or output files, we will build it next to prevent missing module errors at runtime.
If any of the above checks fail, do not proceed until resolved:
If Node.js is outdated, update it and rerun this step.
If any package is not built (empty directory), proceed to Step 1.3 to build missing packages.
If ts-node is missing, the agent startup might fail. You can still use compiled code paths, but for safety, install ts-node or use an alternative start method (we provide alternatives later in Phase 4 if needed).
1.3 Install & Build Missing Dependencies
Install any missing dependencies and build packages that are required for runtime (especially the direct client and Telegram plugin). This also addresses potential lockfile mismatches by ensuring a fresh, consistent install.
bash
Copy
Edit
# Install all dependencies and ensure lockfile consistency (pnpm is used for monorepo)
cd /root/eliza
pnpm install

# Build the client-direct package if not already built (for direct inter-agent API communication fallback)
pnpm --filter @elizaos/client-direct build

# Build the telegram-multiagent plugin package (to include any new fixes we apply to it)
pnpm --filter @elizaos/telegram-multiagent build

# (Optional) Rebuild any other packages if needed, e.g., agent or core, to ensure all latest changes are compiled
# pnpm --filter @elizaos/agent build
# pnpm --filter @elizaos/core build
Expected Results:
✅ Dependencies installed: pnpm install completes without errors. If there were any lockfile mismatch issues, this step should resolve them by syncing the workspace. (If errors persist, consider deleting pnpm-lock.yaml and running pnpm install again, though this should not be necessary.)
✅ client-direct built: The packages/clients/direct/dist folder now contains compiled output (check with ls -la /root/eliza/packages/clients/direct/dist to confirm). This ensures no "module not found" error for @elizaos/client-direct.
✅ telegram-multiagent plugin built: The plugin code is compiled, which is important if we applied source code fixes. The build step should succeed, producing updated files in packages/plugins/telegram-multiagent/dist (or similar output location).
✅ No build errors or missing dependency errors are seen. All necessary packages (@elizaos/core, @elizaos/client-telegram, @elizaos/client-direct, @elizaos/telegram-multiagent, etc.) are now ready for use.
If any build fails or prints errors, address those before moving on:
If pnpm install fails due to network or registry issues, retry it. If it complains about peer dependencies or lockfile, you might add --force or regenerate the lockfile.
If a build fails, check the error for missing modules or TypeScript compile issues. Ensure that all packages have been properly built in order (sometimes core must be built before dependent packages).
In case of persistent build issues for client-direct or others, verify that tsup and esbuild are installed (the tech plan indicated adding those to dependencies was a fix). This should have been covered by our pnpm install if the package.json is up to date.
1.4 Apply Critical Code Fixes (Telegram Plugin Patch)
Fix known issues in the Telegram multi-agent plugin to ensure bot tokens and the Telegram client are accessible within each agent’s plugin context. We will patch the plugin’s initialize method if the fixes are not already present, then rebuild the plugin.
bash
Copy
Edit
# Navigate to plugin source
cd /root/eliza/packages/plugins/telegram-multiagent/src
FILE="TelegramMultiAgentPlugin.ts"

# Check if bot token and client initialization fixes are present; if not, apply patch
grep -q "Successfully loaded bot token" "$FILE" || {
  echo "🔧 Applying TelegramMultiAgentPlugin token and client initialization patch"
  # Insert code into the initialize method
  sed -i '/async initialize/s/$/ {/' "$FILE"  # ensure function signature ends with {
  sed -i '/async initialize.*{/{n; p;}' "$FILE"  # duplicate the opening brace line to insert after
  sed -i '/async initialize/ a\    const agentId = process.env.AGENT_ID || "";\
    const tokenKey = `${agentId.toUpperCase()}_BOT_TOKEN`;\
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env[tokenKey];\
    if (botToken) {\
      this.logger.info(`[TELEGRAM] Successfully loaded bot token: ${botToken.substring(0, 6)}...`);\
      this.config.botToken = botToken;\
    } else {\
      this.logger.error(`[TELEGRAM] Failed to load bot token. Checked TELEGRAM_BOT_TOKEN and ${tokenKey}`);\
      this.logger.debug(`[TELEGRAM] Available env vars: ${Object.keys(process.env).filter(k => k.includes("TOKEN")).join(", ")}`);\
    }\
    let telegramClientInitialized = false;\
    if (this.runtime?.clients?.telegram) {\
      try {\
        const me = await this.runtime.clients.telegram.getMe();\
        if (me && me.id) {\
          this.logger.info(`[TELEGRAM] Client initialized and connected as: ${me.username || me.id}`);\
          telegramClientInitialized = true;\
          this.client = this.runtime.clients.telegram;\
        }\
      } catch (err) {\
        this.logger.error(`[TELEGRAM] Client exists but failed test: ${err.message}`);\
      }\
    }\
    if (!telegramClientInitialized && this.runtime?.client?.telegram) {\
      try {\
        const me = await this.runtime.client.telegram.getMe();\
        if (me && me.id) {\
          this.logger.info(`[TELEGRAM] Legacy client initialized and connected as: ${me.username || me.id}`);\
          telegramClientInitialized = true;\
          this.client = this.runtime.client.telegram;\
        }\
      } catch (err) {\
        this.logger.error(`[TELEGRAM] Legacy client exists but failed test: ${err.message}`);\
      }\
    }\
    if (!telegramClientInitialized && this.config.botToken) {\
      try {\
        const {{ Telegraf }} = await import("telegraf");\
        this.directClient = new Telegraf(this.config.botToken);\
        this.logger.info(`[TELEGRAM] Created direct fallback client`);\
      } catch (err) {\
        this.logger.error(`[TELEGRAM] Failed to create fallback client: ${err.message}`);\
      }\
    }' "$FILE"
}
The above script checks if the patch has been applied by searching for a known log string. If not found, it injects code to:
Load the bot token from the environment (TELEGRAM_BOT_TOKEN or <AGENT>_BOT_TOKEN).
Test and attach the globally injected Telegram client (runtime.clients.telegram or fallback to runtime.client.telegram) to the plugin.
If those aren’t available, create a direct Telegraf client as a fallback to ensure the agent can still function (will allow sending messages, though full bot-to-bot communication may be limited).
After applying the patch, rebuild the plugin to include changes:
bash
Copy
Edit
# Rebuild the telegram-multiagent plugin to compile the new changes
cd /root/eliza
pnpm --filter @elizaos/telegram-multiagent build
Expected Results:
✅ The plugin source file now contains the new code (you can open /root/eliza/packages/plugins/telegram-multiagent/src/TelegramMultiAgentPlugin.ts and verify that the lines for loading bot tokens and initializing the client are present).
✅ The rebuild succeeds with no errors, producing an updated plugin ready for use by agents.
Failure Diagnostics: If the sed patch fails (e.g., due to unexpected file format or already patched code), manually verify the file. The key is that in the initialize() method of TelegramMultiAgentPlugin, you have the logic to load botToken from env and to set up the this.client or this.directClient. If the code is already present from previous work, the sed commands may have done nothing (which is fine).
If the build fails after patching, inspect the error:
A common mistake could be a syntax error from a malformed patch insertion. Open the file and ensure braces and parentheses are balanced. Fix any obvious syntax issues and run the build again.
If TypeScript complains about await usage, ensure that initialize() is declared async (it should be; otherwise add async in the function signature).
If you see an import error for telegraf, make sure telegraf is listed in the plugin’s package.json dependencies (it likely is via the client package; if not, add it and run pnpm install again).
With this fix, each agent’s plugin will properly utilize the Telegram client and token, resolving the blockers: (a) “Telegram bot token access in plugin context” and (b) “Telegram client injection visibility in plugin scope”. The log messages from this code will be checked in Phase 7 to confirm successful initialization.
1.5 Character File Verification (Agent Profiles)
Ensure all required character JSON files are present in the expected directory, so each agent can load its persona without file path errors:
bash
Copy
Edit
# Ensure the characters directory exists in the agent package (both src and build locations if needed)
mkdir -p /root/eliza/packages/agent/src/characters/
mkdir -p /root/eliza/packages/agent/characters/

# Check if character files exist in the primary location
ls -la /root/eliza/packages/agent/src/characters/*.json

# If not found, copy character files from the central characters directory
if [ -d "/root/eliza/characters" ]; then
  cp -u /root/eliza/characters/*.json /root/eliza/packages/agent/src/characters/ 2>/dev/null || true
  cp -u /root/eliza/characters/*.json /root/eliza/packages/agent/characters/ 2>/dev/null || true
fi

# Verify each required character JSON is now present
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  if [ ! -f "/root/eliza/packages/agent/src/characters/${agent}.json" ]; then
    echo "❌ Missing character file: ${agent}.json"
  else
    echo "✅ Found character file: ${agent}.json"
  fi
done
Expected Results:
✅ Characters directory prepared: Both /root/eliza/packages/agent/src/characters/ and /root/eliza/packages/agent/characters/ exist. (We prepare both in case the agent code looks in one or the other due to relative path confusion in different contexts.)
✅ Character files present: For each agent ID (eth_memelord_9000, bag_flipper_9000, linda_evangelista_88, vc_shark_99, code_samurai_77, bitcoin_maxi_420), a corresponding JSON file exists. The script will echo a ✅ for each found file. If any are missing (❌), we must copy them from the original source (likely /root/eliza/characters) or create them if they were never defined.
After running the copy step, ideally all agents report "Found character file". If not, the missing ones should be retrieved from backups or defined manually before continuing. A missing character file will cause the agent to crash on startup (as observed by “File not found in any expected location” errors).
Phase 1 Success Criteria:
All previous processes are stopped and no ports are in use by the system ✅
Node.js is updated (v23+) and required global tools (ts-node) are installed ✅
All project dependencies are installed with no lockfile conflicts ✅
All necessary packages (core, telegram client, direct client, etc.) are built and present ✅
Telegram plugin code is patched for token and client issues ✅
All character JSON files are in place for each agent ✅
If any of these criteria are not met, address them before moving to Phase 2. This preparation phase ensures a clean slate and that our runtime environment has everything it needs, preventing known startup blockers (like SQLite file errors, missing files, or missing code fixes) from reoccurring.
🧪 Phase 2: Runtime Patching and Validation
In this phase, we initialize the ElizaOS runtime with the required patches, specifically injecting the Telegram client globally. We then verify that the patch was applied correctly and that the global runtime is ready for use by agents.
2.1 Apply Runtime Patches
Run the ElizaOS patch script to patch the agent runtime. This script (apply-patches.js) typically loads and applies modifications (such as injecting the Telegram client into the global runtime and fixing any broken behaviors):
bash
Copy
Edit
cd /root/eliza
node patches/apply-patches.js > logs/patches.log 2>&1
This will execute the patching process and redirect all output to logs/patches.log for review. The patch includes things like connecting the Telegram client from @elizaos/client-telegram into the global __elizaRuntime and applying any relay-related fixes.
We run this separately before starting any agents to ensure the runtime is prepared (especially important for multi-agent communication).
Expected Results:
The command should exit quickly (usually within a second or two) and produce no errors. It doesn't stay running; it modifies code/state and exits. There will be no direct console output due to redirection, so we rely on the log file for confirmation.
No immediate errors on the shell. If the command itself throws an exception, it would be printed in the console. If that happens, inspect the error. Common issues could be syntax errors or missing modules (which our Phase 1 steps should have prevented by building everything). Fix any such errors before proceeding (for example, if it says it cannot find @elizaos/client-telegram, ensure that package is linked and built, or adjust the patch script to point to the correct path).
2.2 Verify Runtime Patching
Now we confirm that the patch was successful by checking the log and performing some runtime checks:
bash
Copy
Edit
# Check the patch log for success indicators or errors
echo "---- Patch Log Summary ----"
grep -E "(Successfully|✅|Error|✖)" /root/eliza/logs/patches.log

# Ensure runtime object was created and Telegram client injected
grep -q "Successfully injected telegram client" /root/eliza/logs/patches.log && echo "✅ Telegram client injection logged" || echo "❌ Telegram client injection not confirmed in patch log"
grep -q "Created runtime" /root/eliza/logs/patches.log && echo "✅ Runtime creation logged" || echo "❌ Runtime creation not confirmed"

# Programmatically verify global runtime availability via Node REPL
node -e "console.log(
  'Runtime available globally:', !!globalThis.__elizaRuntime,
  '| Telegram client available:', !!(globalThis.__elizaRuntime?.client?.telegram || globalThis.__elizaRuntime?.clients?.telegram)
)" | tee /root/eliza/logs/runtime_check.log
What this does:
Grep the patch log for any lines indicating success (Successfully or ✅) or any errors (Error or ✖). We expect to see lines like "✅ [PATCH] Successfully injected telegram client" and possibly "Created runtime...". If any errors appear, we flag them.
Check specifically that the patch log contains confirmation of the Telegram client injection and runtime creation. If these checks output "❌", the patch might not have executed as intended.
Finally, run a Node one-liner to inspect the global object. The output should indicate Runtime available globally: true | Telegram client available: true. We log this to runtime_check.log as well for records.
Expected Results:
✅ Patch applied without errors: The summary grep should show lines of success and ideally no lines with "Error". For example:
[VALHALLA] Telegram client mounted to runtime: true
✅ [PATCH] Successfully injected telegram client from @elizaos/client-telegram
If any "Error" or "not found" messages appear in patches.log, investigate them immediately (e.g., a module import failed; possibly a build or path issue).
✅ Global runtime present: The Node REPL check should output Runtime available globally: true and Telegram client available: true. This confirms that globalThis.__elizaRuntime exists and has a .client.telegram (or .clients.telegram) object. If either is false, the patch did not fully take effect:
If runtime is false, the patch might not have initialized the global correctly.
If client is false, the Telegram client injection failed (perhaps the client package wasn’t loaded). Revisit Phase 1 if needed (build/link issues).
✅ Patch log sanity: The presence of "Successfully injected telegram client" in the log is a strong indicator that the main patch we care about ran. Also, no critical errors should be in the log.
Failure Diagnostics:
If the patch log indicates a failure or missing injection:
Open /root/eliza/logs/patches.log and read through it (use less or cat). Look for any exceptions or stack traces. Common problems could be Error: Cannot find module '@elizaos/client-telegram' (indicating a linking/build issue for that package) or a runtime logic error.
Ensure that @elizaos/client-telegram is properly installed in the node_modules. You might try running pnpm link --global @elizaos/client-telegram && pnpm link @elizaos/client-telegram as the tech plan suggested, if dynamic import cannot find it.
Check that runtime-patch.js (called by apply-patches.js) is pointing to the correct package name. The tech notes mentioned fixing an import from @elizaos-plugins/client-telegram to @elizaos/client-telegram. If your code still had the wrong import, the patch wouldn’t load the client. Correct the import and rerun apply-patches.js.
If the global runtime check returns false for client availability but the patch log was okay, it might be that the patch placed the client in a different property (runtime.clients.telegram vs runtime.client.telegram). Our plugin fix in Phase 1.4 covers both, but ensure the check accounts for both (our one-liner does). If still false, the injection truly failed – double-check the patch script and logs.
Phase 2 Success Criteria:
The patch script runs and exits cleanly (no crashes/hangs) ✅
logs/patches.log shows successful runtime patching and no errors ✅
The global __elizaRuntime is instantiated and includes the Telegram client ✅
The runtime has critical methods (like handleMessage) ready – this is implied by successful patch, but you could also grep "handleMessage" logs/patches.log to confirm if logged.
With the runtime patched and verified, we can proceed to launching the relay and agents knowing that they will have the necessary runtime modifications available.
🧪 Phase 3: Relay Server Deployment
Now we start the relay server, which acts as a central hub allowing bots to exchange messages. We must ensure the relay starts on the correct port with no conflicts, and validate its health.
3.1 Start Relay Server
Start the relay on port 4000 (default). First ensure nothing is already occupying that port (we did this in Phase 1, but we double-check to avoid EADDRINUSE errors):
bash
Copy
Edit
# Verify port 4000 is free or kill any stray process (should be free after Phase 1, but just in case)
lsof -i:4000 && echo "⚠️ Port 4000 busy, killing process..." && lsof -i:4000 -t | xargs kill -9
# If a process is listed and killed, wait briefly to ensure the port is freed.
sleep 1

# Start the relay server in the background
cd /root/eliza/relay-server
PORT=4000 RELAY_AUTH_TOKEN="elizaos-secure-relay-key" node server.js > ../logs/relay-server.log 2>&1 &

# Give the relay a moment to initialize (or use a loop to wait for health)
sleep 3
We set the environment variable RELAY_AUTH_TOKEN to the secret key expected by the relay (ensure this matches what agents will use).
The relay logs are written to /root/eliza/logs/relay-server.log for debugging.
The sleep 3 provides a short delay for the server to start. (If the machine is slow or the server takes longer, we might need to wait a bit more or check in a loop.)
Expected Results:
The relay server process starts and runs in the background. You can verify with ps that a node server.js (with PORT=4000) is running.
No immediate error output. If the port was still busy, the node server.js might exit with an EADDRINUSE error. Our pre-check tries to kill anything on 4000, but if the port remains unavailable, consider using a different port (update both relay and agents accordingly) or figure out what else is using it.
The relay log file is created. It may contain startup messages (we'll check in the next step).
3.2 Verify Relay Server
Check that the relay is functioning by hitting its health endpoint and examining the log:
bash
Copy
Edit
# Check relay health endpoint (expects a JSON or status response)
curl -s http://localhost:4000/health | tee /root/eliza/logs/relay_health.log

# Look for an "ok" status in the health output
grep -q "ok" /root/eliza/logs/relay_health.log && echo "✅ Relay health check OK" || echo "❌ Relay health check failed"

# Tail the last few lines of relay server log to confirm it's running without errors
echo "---- Relay Server Log (last 10 lines) ----"
tail -n 10 /root/eliza/logs/relay-server.log
Expected Results:
✅ Health endpoint returns OK: The curl to /health should return a response indicating status (often {"status":"ok"} or similar). Our check greps for "ok".
✅ Relay log shows startup success: The log tail should show something like "Relay server listening on port 4000" or any relevant startup info, and no fatal errors. At minimum, the absence of new errors in the last few lines is a good sign.
The relay log might also show that it’s waiting for connections or any registered agents (none yet, so likely it’s just idle after startup).
If the health check fails (❌):
Ensure the relay process is still running (ps aux | grep server.js). If not, it likely crashed on start. Check the log for errors (e.g., syntax error, port in use, missing dependency).
If the process is running but health endpoint fails, perhaps the server didn’t start correctly. Check if the server expects a different path or no /health endpoint. The plan assumes one exists; if not, try a basic request like /ping or just see if port 4000 is open (e.g., telnet localhost 4000).
If logs show EADDRINUSE, verify no other service is using port 4000 (you might have to choose a different port and update RELAY_SERVER_URL for agents accordingly).
If you see authentication or token errors in the log at this stage (unlikely, since no agents connected yet), double-check the RELAY_AUTH_TOKEN usage.
Phase 3 Success Criteria:
Relay server running as a background process on port 4000 ✅
Relay health check responds with “ok” (or expected success message) ✅
Relay server log shows it started listening with no errors ✅
At this point, the communication hub is up. Next, we will start the agents one by one, ensuring each can connect to this relay and initialize properly.
🧪 Phase 4: Single Agent Deployment
We will launch one agent first (Bitcoin Maxi 420) to isolate any startup issues. This allows us to verify that the patched runtime and relay integration work for a single agent before scaling out to all six.
4.1 Launch First Agent (Bitcoin Maxi 420)
Set environment variables and start the first agent. We use the Bitcoin Maxi (bitcoin_maxi_420) as an example (port 3004). We will explicitly specify its character file, Telegram client, plugin, and port.
bash
Copy
Edit
cd /root/eliza

# Set environment for the agent
export AGENT_ID=bitcoin_maxi_420
export USE_IN_MEMORY_DB=true                      # Use in-memory SQLite to avoid file locks/errors
export RELAY_SERVER_URL="http://localhost:4000"   # Relay server address
export RELAY_AUTH_TOKEN="elizaos-secure-relay-key"# Must match the relay's token
export TELEGRAM_GROUP_IDS="-1002550618173"        # Telegram group where bots interact (example ID)
export TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420="${TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420}"
export FORCE_EXACT_PORT=true    # force using the specified port
export DISABLE_POLLING=false    # ensure the bot uses polling (or long polling) if applicable
export FORCE_GC=true            # enable periodic forced garbage collection to mitigate memory leaks

# (Optional) Ensure the bot token is available in env; warn if empty
if [ -z "${TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420}" ]; then 
  echo "❌ ERROR: Bot token for ${AGENT_ID} is not set. Export TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420 and retry." 
  exit 1 
fi

# Start the agent with runtime patches (in background)
node patches/start-agent-with-patches.js --isRoot \
  --characters=/root/eliza/packages/agent/src/characters/bitcoin_maxi_420.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --port=3004 \
  --log-level=debug > /root/eliza/logs/bitcoin_maxi_420.log 2>&1 &

# Wait for the agent to finish startup routine
sleep 10
Explanation:
We export AGENT_ID and a series of other env vars. These will be read by the agent process and the plugin (via process.env). Notably, TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420 must contain the actual Telegram API token for this bot, which should be obtained from @BotFather. Ensure this environment variable was set in your shell (or replace the placeholder in the script with the actual token). The script above expects it already in the environment (perhaps sourced from a secrets file).
USE_IN_MEMORY_DB=true forces the agent to use a memory-only SQLite database, which avoids file I/O and known SQLITE_ERROR issues. This addresses the SQLite connection error blocker.
FORCE_EXACT_PORT=true ensures the agent will bind to the specified port (3004). Without this, if 3004 was busy, the agent might auto-increment to another port, which we don’t want in this controlled setup.
DISABLE_POLLING=false means the Telegram client will use polling (if true, might disable updates; we keep it false so the bot receives updates).
FORCE_GC=true enables an internal mechanism (if implemented in ElizaOS) to call global.gc() periodically, which can alleviate memory leaks by forcing garbage collection. We ensure Node is run with --expose-gc if needed (the start-agent-with-patches.js or underlying code likely handles this if FORCE_GC is true).
The start-agent-with-patches.js --isRoot script is a custom entrypoint that applies patches (like hooking the runtime) and then starts the agent. We pass the agent’s JSON character config and specify the Telegram client and multiagent plugin packages to load, as well as the port and log level.
Output is redirected to a log file specific to this agent.
Expected Results:
The agent process starts and remains running in the background. Check with ps:
bash
Copy
Edit
ps aux | grep "bitcoin_maxi_420"
You should see a node process corresponding to this agent (with the given port or script name in the command arguments). If it exited immediately, there’s a problem.
The agent’s log file /root/eliza/logs/bitcoin_maxi_420.log is created and should contain the startup sequence logs.
No immediate errors printed to console (we redirected output, so check the log for errors).
Common startup messages (in the log) might include:
Database initialization (should succeed or use memory DB).
Loading character file (should find the JSON we copied).
Initializing plugins (look for lines from [PLUGIN][VALHALLA] or similar).
Connecting to Telegram (like Telegraf launching polling, etc.).
Registering with relay (perhaps a log like "Registered with relay server" or a handshake message).
A final message like "Plugin fully initialized" or similar success indicator.
If the agent does not appear to be running:
Run the node patches/start-agent-with-patches.js ... command in the foreground (without redirect and &) to see error output in real-time. For example:
bash
Copy
Edit
node patches/start-agent-with-patches.js --isRoot --characters=... --clients=@elizaos/client-telegram --plugins=@elizaos/telegram-multiagent --port=3004 --log-level=debug
Watch for errors such as:
Module not found (indicates a build/link issue for one of the packages; ensure Phase 1 builds were done).
Syntax or TypeScript errors (could indicate an issue in our patched code – fix the code and rebuild the plugin if so).
SQLite errors (if you forgot USE_IN_MEMORY_DB, it might try to open a file; our env sets it, so that should be fine).
Telegram API errors (like unauthorized token – ensure the token is correct).
Any crash stack trace – address accordingly (the log and error will give clues).
Timing Note: The sleep 10 is an arbitrary wait for the agent to initialize. If the machine is under heavy load or the agent downloads something on start, it might need more time. If subsequent health checks fail, consider increasing this delay or implementing a loop to check readiness.
4.2 Verify Agent Health and Initialization
Now verify that the single agent started correctly, is reachable via its HTTP interface, and is registered with the relay:
bash
Copy
Edit
# Check that the agent process is running
ps aux | grep "start-agent-with-patches.js" | grep "$AGENT_ID" | grep -v grep

# Check the agent's HTTP health endpoint
curl -s http://localhost:3004/health | tee -a /root/eliza/logs/agent_health_${AGENT_ID}.log

# Look for "ok" in the health response
grep -q "\"status\":\s*\"ok\"" /root/eliza/logs/agent_health_${AGENT_ID}.log && echo "✅ Agent health endpoint OK" || echo "❌ Agent health endpoint not OK"

# Check agent log for successful plugin initialization and Telegram client/tokens
grep -E "(Plugin fully initialized|Successfully loaded bot token|Client initialized and connected)" /root/eliza/logs/bitcoin_maxi_420.log

# Check that the agent registered itself with the relay (the relay health should list connected agents count or similar)
curl -s http://localhost:4000/health | tee /root/eliza/logs/relay_health_after_agent.log
What we are doing:
We ensure via ps that a process with AGENT_ID (bitcoin_maxi_420) and the start-agent-with-patches script is present.
We query the agent’s /health endpoint, which should return a JSON with status. We append it to a log for record.
We look for "status":"ok" in that JSON.
We grep the agent’s log for key phrases:
"Plugin fully initialized" – indicates the Valhalla plugin finished setting up.
"Successfully loaded bot token" – from our patch, confirming the env token was picked up.
"Client initialized and connected" – from our patch, confirming the global Telegram client was accessible and the bot connected to Telegram (i.e., getMe() succeeded).
We also check the relay’s health again. Depending on how the relay health is implemented, it might list the number of connected clients or their IDs. We saved the output to relay_health_after_agent.log for inspection. It might show something like agents: 1 or have a list.
Expected Results:
✅ Agent process present: The ps command should show the agent is running. If it’s not found, then the agent process likely crashed or did not start; revisit the launch step to see what happened.
✅ Agent health OK: The output of the health check should contain "status":"ok". If the agent returns a full JSON, it might include other info like uptime or agent ID. The key is that the service is responsive on port 3004. A failure to connect or an error response indicates the agent might not have fully started or is in error state.
✅ Agent log initialization:
The grep for "Plugin fully initialized" should return a line from the log. If found, it confirms the multiagent plugin finished setting up properly.
"Successfully loaded bot token" should appear, verifying our Phase 1.4 fix worked and the token was read (it will show the first 6 chars of the token in the log). If this line is missing or there's an error about failing to load bot token, then our patch might not have executed. Check for "Failed to load bot token" in the log instead – if present, the agent couldn’t get the token. In that case, verify the env variable name and our patch insertion.
"Client initialized and connected as ..." should appear if the global client was successfully used. This indicates the agent has connected to Telegram (the getMe() API call succeeded). If you see an error like "Client exists but failed test" or no mention of client, then the agent might be running on its fallback directClient. It would still work for sending messages, but not ideal for full interaction. We can proceed but note that multi-agent communication might be limited if the global client injection failed.
✅ Relay updated: The relay health after agent connection might show that one agent is connected. If the relay health endpoint provides details, verify that it recognizes one client. For example, some relay health might list connected client IDs or just a count. If nothing in the relay health output changed, you may need to check the relay log manually:
bash
Copy
Edit
grep "Agent connected" /root/eliza/logs/relay-server.log
or similar. Ensure that the agent did attempt to register: The agent log might also show something: e.g., [VALHALLA][FLOW] Registered with relay or an HTTP 200 on hitting relay. If not, check that the agent has the correct RELAY_SERVER_URL and RELAY_AUTH_TOKEN (they should, from our env). If there's a mismatch in token, the relay might reject the connection – look in relay log for authentication errors.
If any check fails:
If the agent’s health endpoint is not responding, inspect bitcoin_maxi_420.log for errors. Possibly the agent crashed after startup. Common culprits: out-of-memory (unlikely with one agent on 20GB RAM), unhandled exceptions in plugin code, or inability to connect to Telegram (if a token is invalid, some frameworks still keep running and just log errors).
If "Plugin fully initialized" is missing, perhaps the plugin didn’t finish loading. Look for [PLUGIN][VALHALLA] logs; maybe an error in plugin initialization aborted it. The plugin code we patched might throw if something went wrong. Check for exceptions in the log around that time.
If token load failed, ensure the env var name is correct. Our script uses TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420. The plugin patch checks process.env.TELEGRAM_BOT_TOKEN or process.env[BITCOIN_MAXI_420_BOT_TOKEN]. Notice the plugin code expects an env var named BITCOIN_MAXI_420_BOT_TOKEN as a fallback. We exported TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420. This is a subtle mismatch: to satisfy the plugin, we should also export a generic TELEGRAM_BOT_TOKEN (if only one agent) or ensure the plugin code concatenation matches our naming. In our patch code, tokenKey = <AGENT>_BOT_TOKEN, which for agent bitcoin_maxi_420 becomes BITCOIN_MAXI_420_BOT_TOKEN. That means our env should have BITCOIN_MAXI_420_BOT_TOKEN. We provided TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420. The patch checks process.env.TELEGRAM_BOT_TOKEN first (which is not set in our case) then process.env["BITCOIN_MAXI_420_BOT_TOKEN"]. This is actually an inconsistency – to fix this, we can quickly also set:
bash
Copy
Edit
export BITCOIN_MAXI_420_BOT_TOKEN="${TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420}"
either in Phase 4.1 before launching or now. For completeness, we should do that for each agent or adjust our naming. To avoid confusion, we will stick to the TELEGRAM_BOT_TOKEN_* for our own env usage but note that our patch expects the alternate name too. To be safe, set both if needed. (We will incorporate this in Phase 5 for all agents.)
If the agent didn’t register with relay, double-check RELAY_AUTH_TOKEN on both sides. Also ensure the agent has network access to localhost:4000 (it should).
Now that one agent is running properly, we can scale up. Phase 4 Success Criteria:
Single agent process is running and not crashing ✅
Agent’s health endpoint returns status “ok” ✅
Agent log indicates successful initialization (plugins loaded, token loaded, Telegram connected) ✅
Agent is authenticated and connected to relay server ✅
This confirms that the core system (runtime patch + one agent + relay) is functioning. Next, we deploy the rest of the agents.
🧪 Phase 5: Multi-Agent Deployment
With one agent verified, we can start the remaining five agents in similar fashion. We’ll use a script/loop to start each with its respective parameters. We must ensure each agent gets its unique token and port, and then verify all are running and connected.
5.1 Launch All Remaining Agents
We will start the other agents one by one:
eth_memelord_9000 (port 3000)
bag_flipper_9000 (port 3001)
linda_evangelista_88 (port 3002)
vc_shark_99 (port 3003)
code_samurai_77 (port 3005)
We already have bitcoin_maxi_420 on 3004 from Phase 4.
bash
Copy
Edit
# Define a function to start an agent with given ID and port
start_agent() {
  local agent_id="$1"
  local port="$2"
  echo "Starting agent: ${agent_id} on port ${port}"

  export AGENT_ID="${agent_id}"
  export USE_IN_MEMORY_DB=true
  export RELAY_SERVER_URL="http://localhost:4000"
  export RELAY_AUTH_TOKEN="elizaos-secure-relay-key"
  export TELEGRAM_GROUP_IDS="-1002550618173"
  # Set both naming conventions for token to ensure plugin picks it up
  export TELEGRAM_BOT_TOKEN_${agent_id^^}="${!TELEGRAM_BOT_TOKEN_${agent_id^^}}"  # use existing env var value
  export ${agent_id^^}_BOT_TOKEN="${!TELEGRAM_BOT_TOKEN_${agent_id^^}}"

  export FORCE_EXACT_PORT=true
  export DISABLE_POLLING=false
  export FORCE_GC=true

  # Launch the agent
  node patches/start-agent-with-patches.js --isRoot \
    --characters="/root/eliza/packages/agent/src/characters/${agent_id}.json" \
    --clients=@elizaos/client-telegram \
    --plugins=@elizaos/telegram-multiagent \
    --port="${port}" \
    --log-level=debug > /root/eliza/logs/${agent_id}.log 2>&1 &

  # Wait a bit for this agent to initialize (to avoid all starting exactly at once)
  sleep 8
}

# Start each additional agent (eth_memelord_9000 through code_samurai_77)
start_agent "eth_memelord_9000" 3000
start_agent "bag_flipper_9000" 3001
start_agent "linda_evangelista_88" 3002
start_agent "vc_shark_99" 3003
start_agent "code_samurai_77" 3005

# (bitcoin_maxi_420 is already running on 3004)
Notes:
We uppercase the agent_id for the token environment variable name (since our convention is TELEGRAM_BOT_TOKEN_<UPPERCASE_ID>). The syntax ${agent_id^^} uppercases the string. We then use indirect expansion ${!VAR} to retrieve the value of the existing token variable. This assumes you have previously exported TELEGRAM_BOT_TOKEN_ETH_MEMELORD_9000, etc., for each bot. Ensure all six token env variables are set in your environment before running this script (just like we did for bitcoin_maxi_420, you should have similar ones for others, or source a file that sets them).
We also set ${agent_id^^}_BOT_TOKEN for compatibility with the plugin patch. This means for agent_id=eth_memelord_9000, we set ETH_MEMELORD_9000_BOT_TOKEN to the same value as TELEGRAM_BOT_TOKEN_ETH_MEMELORD_9000. This covers the naming that the plugin might expect. (The plugin will check TELEGRAM_BOT_TOKEN and <ID>_BOT_TOKEN; we fill the latter explicitly now.)
The rest of env vars are the same for all agents.
We give each agent 8 seconds head start before launching the next. This staggering helps reduce initial burst load and mitigates race conditions (e.g., many agents hitting the relay simultaneously or heavy disk I/O all at once). We already patched the runtime globally in Phase 2, so it's okay to start them in quick succession now.
Check that the ports (3000-3005) align with each agent as labeled in comments. We skip 3004 because bitcoin_maxi_420 is using it.
Expected Results:
All five new agents are started and running in the background (plus the one from Phase 4, making six total). Use ps to confirm:
bash
Copy
Edit
ps aux | grep start-agent-with-patches | grep -v grep
The output count should be 6 processes, one for each agent. (The plan below will also count them.)
Each agent will have its own log file (/root/eliza/logs/<agent_id>.log). These should show similar successful initialization sequences as the first agent. There might be some variations in speed or timing, but ultimately each should load its character, initialize the plugin, connect to Telegram, and register with the relay.
If any agent fails to start, its log file will likely be short or contain an error. You will catch that in the next verification step.
5.2 Verify All Agents Running and Connected
Now ensure that all agents are up, healthy, and connected to the relay:
bash
Copy
Edit
# Count agent processes
AGENT_COUNT=$(ps aux | grep "start-agent-with-patches.js" | grep -v grep | wc -l)
echo "Running agent processes: $AGENT_COUNT (expected 6)"

# Check each agent's health endpoint quickly
for port in 3000 3001 3002 3003 3004 3005; do
  status=$(curl -s http://localhost:${port}/health | jq -r .status)
  echo "Port ${port} health status: ${status}"
done

# Query relay for overall status of agents after all are launched
curl -s http://localhost:4000/health | tee /root/eliza/logs/all_agents_relay.log

# Check each agent's log for initialization success keywords
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "---- ${agent} startup check ----"
  grep -E "(Plugin fully initialized|Successfully loaded bot token|Client initialized and connected)" /root/eliza/logs/${agent}.log | tail -n 3
done
We do the following:
Count the running agent processes to see if we have 6.
Loop through each expected port (3000-3005) and hit the /health endpoint, extracting the .status field using jq (assuming the output is JSON). This quickly tells us if each one is responding and what status it reports.
Fetch the relay’s health one more time now that all agents should have connected. The all_agents_relay.log might contain details like the number of connected clients or their IDs.
For each agent log, we grep for the key lines (same ones as before) to see if the plugin initialized, token loaded, and client connected. We tail the last 3 matches in case the log is lengthy, to ensure we get the latest relevant messages.
Expected Results:
✅ Agent count = 6: The script should output "Running agent processes: 6 (expected 6)". If the number is less, one or more agents did not stay running. Identify which by comparing with the list or checking which port’s health fails.
✅ All health endpoints OK: For each port, the status printed should be "ok". If any prints null or an error like Connection refused (if jq says null it might mean it got something unexpected or empty), that agent is not healthy.
If one agent’s health fails, check its log immediately for errors. It could be a crash or an initialization hang. Common issues could be that particular character file missing or malformed (since each has a distinct JSON), or a token issue (maybe an incorrect token causing an unhandled rejection? Though usually that wouldn’t crash the service, just cause Telegram API errors).
Another cause: port conflict (if one of those ports was accidentally still in use by something else that we missed). Ensure nothing else was running on e.g. 3000 from a prior partial run.
If needed, kill that agent and try to restart it individually after fixing any issue.
✅ Relay sees all agents: The relay health (all_agents_relay.log) should indicate all 6 registered. If the relay outputs a list or count, verify it matches 6. If not, see which agent didn’t register (likely the one with health issues). Also check relay-server.log for any errors like authentication failures for specific agents.
✅ Logs show successful init: For each agent log, we want to see:
"Plugin fully initialized" – confirms the Valhalla plugin didn't abort.
"Successfully loaded bot token" – confirms our fix is working for each (each should show its own token snippet).
"Client initialized and connected as <username>" – confirms each bot connected to Telegram (the username would be the bot’s username). If some show the fallback path, it might log "Created direct fallback client". If you see that for any agent, it means that agent could not use the global client and resorted to its own client. The system will still function, but that agent will not receive other bots’ messages because Telegram won't deliver them. It's an indicator that something in the patch didn’t hook for that agent. Possibly a race where that agent started before apply-patches.js was fully effective globally (should not happen since we did patch globally prior to any agent). Or an env difference. If one or two agents have this issue, you might try restarting just those after all others to see if it was timing. Also ensure they had the env token at launch (if a bot token was missing, the plugin would log failure to load token and thus not attach global client).
No repeating crashes or restarts in logs (the logs should not show the process restarting repeatedly; if you see timestamps resetting, the process might be in a crash loop—this shouldn't happen with our method since we aren't using a supervisor that auto-restarts, but just in case).
Check memory usage as well now that all agents are up (especially with 6 processes on one machine). Although 20GB is plenty, a memory leak could cause one process to grow unexpectedly:
bash
Copy
Edit
ps -o pid,comm,rss,etimes | grep node
This will show RSS (resident memory) and elapsed time. All agents should have reasonable memory footprints (tens of MBs possibly, maybe a couple hundred at most initially). If one is extremely large or growing fast, note it for Phase 7 diagnostics.
If any agent is not behaving:
Fix any issues for that agent (like re-copy its character file, re-export its token, etc.) and rerun the start_agent for it specifically. It’s safe to rerun for one agent if needed (just be careful not to duplicate running processes for same agent; kill the old one first).
If an agent repeatedly fails due to an in-memory DB issue (shouldn’t, but if it does, try deleting any cache or ensure USE_IN_MEMORY_DB is truly being picked up by that agent).
If you suspect a race condition (like maybe all connecting to relay simultaneously causing a hiccup), you can try adding a slightly longer stagger or starting two at a time.
At this stage, also watch the system load. Six agents with debug logging might use significant CPU. If the machine is swapping or very high CPU, it could slow down agents and cause timeouts. If needed, you can lower --log-level to "info" or similar to reduce log overhead, or ensure debug logs aren’t flooding.
Phase 5 Success Criteria:
All six agent processes are running concurrently ✅
Each agent’s /health endpoint reports status "ok" ✅
Relay server acknowledges all agent connections (all agents registered) ✅
Each agent’s log confirms proper initialization (no missing token errors, each connected to Telegram) ✅
Now we have the full set of agents up and presumably functioning. The next phase will test inter-agent communication.
🧪 Phase 6: Communication Testing
We will test basic bot-to-bot communication via the relay. Because Telegram bots cannot directly see messages sent by other bots in a group, the relay is critical. We simulate a message to one agent and see if others receive and respond appropriately. We also verify that messages go through the relay.
6.1 Test Bot-to-Bot Message Relay
Send a test message into the system and observe how it propagates:
bash
Copy
Edit
# Pick one agent (e.g., eth_memelord_9000 on port 3000) to inject a message as if it received it from Telegram
# We use its API to simulate a message in the shared group chat that all bots are part of.
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"text": "gm everyone! #test", "chat_id": "-1002550618173"}' \
  | tee /root/eliza/logs/test_message_api.log

# Give the agents time to process and respond (they might generate responses asynchronously)
sleep 15

# Check relay server logs for evidence of message forwarding
echo "---- Relay log messages around test ----"
grep -A5 -B5 "gm everyone! #test" /root/eliza/logs/relay-server.log

# Check each agent's log for how they handled the message
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "======== ${agent} log excerpt ========"
  grep -E "Received Telegram message|Forwarded to relay|Found new messages|Sending reply" /root/eliza/logs/${agent}.log
done
What we are doing:
Using the HTTP API of one agent (/api/message) to send a message. This simulates that agent receiving a message from the specified chat_id (the Telegram group). We include a text "gm everyone! #test". This should trigger the agent to process the message and, likely, because it’s in a group context, forward it to the relay so other agents know about it.
We wait 15 seconds to allow all message handling to occur (this is arbitrary but should cover any processing and reply generation, which often involves AI response generation that could take a few seconds).
We then search the relay log for occurrences of our test message to ensure the relay saw it.
We search each agent’s log for relevant events:
"Received Telegram message" – the agent should log when it receives a message from Telegram (for those that directly receive it, e.g., the one we hit via API).
"Forwarded to relay" – likely logged by an agent when it sends something to relay (the sending agent should do this so others get it).
"Found new messages" – possibly logged when an agent polls or receives from the relay new messages intended for it.
"Sending reply" – when an agent sends a response back out (via Telegram client API). We print all such lines (or multiple lines if they exist) for analysis.
Expected Results:
✅ Test message API call succeeds: The curl POST should return a 200 OK and maybe some JSON (depending on implementation, possibly the message object or a simple acknowledgement). We log it to test_message_api.log. If it failed (non-200), see that log for error. A failure could mean the agent’s API didn’t handle the message (maybe the endpoint is different or requires an auth – if so, adjust accordingly or use the correct method to inject a message).
✅ Relay log records the message: In relay-server.log, we should see something around "gm everyone! #test". Possibly an entry like "Received message from agent X" or "Broadcasting message to other agents" etc. If the relay is working, it will log the intake of a message and sending it out to peers.
If the relay log does not show the message, then the agent may not have forwarded it. Possibly our injection via /api/message bypassed the relay logic (maybe the agent processes it as a user message and not as a bot message). In that case, the other agents wouldn’t know about it unless the sending agent explicitly uses the relay in code. We might need to adjust the test: another approach is to simulate a Telegram update to one bot as if from a human. But since we can’t easily trigger Telegram from here, the API route is our method.
If no relay activity is seen, check the sending agent’s log to see if it tried to forward.
✅ Agents processed the message:
The agent on port 3000 (eth_memelord_9000, our sending agent) should have a log "Received Telegram message: gm everyone! #test" (since we hit its API, it likely treated it as if it got a message).
That agent should also log "Forwarded to relay" (assuming the multiagent plugin is designed to forward any message it sees from the group that possibly originated from a user or itself).
All other agents (3001-3005) should log something like "Found new messages" from relay or "Received Telegram message" if the relay actually injects messages in a way that triggers their Telegram client (less likely because Telegram won’t send them, so maybe the plugin creates a synthetic Telegram update).
More likely, their plugin polls the relay and then logs "Found new messages in relay queue" or something, then processes it.
Then, ideally, at least one other agent will decide to respond. Their log would show "Sending reply" or something similar.
The sending agent might or might not respond (since it might see its own message and choose not to respond if it recognizes it as itself, or maybe all respond).
✅ At least one response: Check if any agent's log shows "Sending reply" or any evidence of generating a response (some output text or calling Telegram API). If our system is configured for conversation, usually one or more other personas will reply "gm" or something. The exact behavior depends on how their logic is written. But success is at least that they processed it without error.
If outcomes are not as expected:
If the API call failed or did nothing, ensure the URL and payload are correct for the agent’s API. Some implementations might require a different path or payload structure. We assumed a generic endpoint from typical agent frameworks. If needed, adjust to how this agent expects input (check agent documentation or code).
If the relay didn’t get the message, the multiagent plugin might not be forwarding it. Possibly a config like DISABLE_RELAY or similar could stop it. We didn't set such, so it should forward. You may increase log verbosity on the plugin if needed (we already set debug).
If agents didn't receive anything, ensure that each agent’s plugin knows the common group id and is looking for messages from relay. The TELEGRAM_GROUP_IDS was set for all to the same ID, so they know the context. They might filter out messages that are from themselves.
If no one responded, it could be that the AI logic didn't generate a reply for "gm everyone! #test" (maybe because it's just a greeting). This might be normal if they only respond when addressed or if a certain trigger word is used. To force a response, you might try a message that each agent definitely responds to, or manually instruct one to respond. However, from a system perspective, as long as the message was processed and there were no errors/exceptions, the relay system is working. We mainly want to ensure the pipeline, not the AI behavior.
Check each agent log for any exceptions during this test period. For example, errors in message handling, or unhandled promise rejections, etc. If present, they might point to issues in how messages are forwarded or processed (could be related to the patched logic).
If an agent shows Failed to create fallback client or similar in logs around this time, it might indicate an issue with using the global client, but since we already saw all connected, hopefully not.
Phase 6 Success Criteria:
A test message can be injected and is accepted by an agent (API call successful) ✅
The relay server logs the receipt and distribution of the message ✅
All other agents detect the message via the relay (logs show they received or at least saw new message events) ✅
At least one agent generates a response to the message (as evidence of end-to-end communication) ✅
Even if the content of the response is not important, the fact that a response was attempted shows that the system is interacting. If no response occurred, ensure at minimum that no errors occurred and the message was processed; you may need to send a different test or actually use a real Telegram message in Phase 8 to fully see responses. At this point, the core multi-agent communication loop is working. Next, we perform deeper diagnostics and then a live integration test.
🧪 Phase 7: Advanced Diagnostics (If Needed)
This phase is optional and intended to dig deeper if any issues are suspected. We will explicitly check that each agent’s Telegram client is indeed initialized, that each has the correct bot token loaded, and examine memory usage for any leaks or large garbage collection pauses.
7.1 Telegram Client and Token Verification (Per Agent)
We will scan the logs of each agent for evidence of proper Telegram client initialization and token loading:
bash
Copy
Edit
# Check each agent for Telegram client initialization logs
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "---- ${agent}: Telegram Client Check ----"
  grep -E "\[TELEGRAM\].*(Client initialized|Created direct fallback client|Failed to create fallback)" /root/eliza/logs/${agent}.log | tail -n 2
done

# Check each agent for bot token load logs or errors
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "---- ${agent}: Bot Token Check ----"
  grep -E "\[TELEGRAM\].*(Successfully loaded bot token|Failed to load bot token)" /root/eliza/logs/${agent}.log | tail -n 1
done
The first loop looks for any lines about client initialization or fallback creation in each agent’s log:
"Client initialized and connected as" (success via global client).
"Legacy client initialized" (if it used the older path).
"Created direct fallback client" (means global failed and fallback was used).
"Failed to create fallback client" (even fallback failed, which would be a serious issue).
The second loop checks for the token load line or failure:
"Successfully loaded bot token" vs "Failed to load bot token".
Expected Results:
All agents should show "Successfully loaded bot token" (with their token snippet). If any show "Failed to load bot token", that agent did not get its token from env. By now we likely fixed this via env naming. If one failed, you may have missed exporting its token or spelled its ID differently. Ensure it's set and possibly restart that agent if needed.
For client initialization:
Ideally, each agent shows "Client initialized and connected as <bot_username>" (or at least legacy variant) and does not show "Created direct fallback client". That indicates every agent is using the unified patched client (which means they can share updates via relay effectively).
If some show "Created direct fallback client", it means that agent’s plugin did not see the global client. This could be due to a race or that agent starting before apply-patches (which we did early, so maybe not race) or perhaps its environment was slightly different. It's not ideal but not catastrophic; that agent will still respond to human messages but likely won't receive other bots' messages. If, for instance, only one agent fell back, you might consider restarting it to try again, or just note it as a known quirk.
If any show "Failed to create fallback client", then even the fallback didn't work (maybe Telegraf import failed). That agent likely cannot function properly in Telegram. Investigate its earlier log lines for token presence (it probably also had no token). The solution would be to ensure token and restart.
Summarize: by now, all should be good due to our previous steps, so this is mostly confirming no stragglers.
7.2 Memory and Performance Diagnostics
We check memory usage of each agent process and look for any signs of garbage collection issues in logs:
bash
Copy
Edit
# Show memory usage (RSS in KB) of each agent process
echo "PID   RSS(KB)   COMMAND"
ps -o pid,rss,command | grep "start-agent-with-patches.js" | grep -v grep | sort -k2 -n

# Check logs for any memory or GC-related messages
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  grep -E "(\[MEMORY\]|\[GC\]|heap out of memory)" /root/eliza/logs/${agent}.log | tail -n 3
done
The ps command lists processes with their RSS (Resident Set Size) memory in KB, sorted by memory usage. This lets us see if any agent is using significantly more memory than others or an unexpectedly large amount (given no heavy conversation has happened yet).
We also grep each log for any [MEMORY] or [GC] tags, assuming the system might log those if FORCE_GC triggers logs or if any OOM error occurred. We also include "heap out of memory" just in case an OOM crash stack trace appears.
Expected Results:
Memory usage for each agent should be somewhat similar. Possibly in the range of a few tens of MB (for an idle bot) up to maybe a few hundred if the language model is loaded (depending on what these agents do). Since these are multi-agent bots, they might not have huge models loaded locally (likely they call an API for AI responses?), hard to say. Anyway, none should be near the system limit.
No process should be in the GBs at this point. If one agent’s RSS is climbing rapidly or is much larger, that could indicate a memory leak (maybe in that agent’s plugin or logic).
If FORCE_GC is true, the system might periodically log GC events. If so, you'll see [GC] logs which is fine, it indicates the GC runs. If memory is stable due to forced GC, that’s good. If you see [MEMORY] warnings or (worse) “JavaScript heap out of memory” errors in any log, that’s a sign of a memory leak or insufficient memory given. With 20GB total, it's unlikely a single agent OOMs unless something is wrong (like infinite generation or logs filling memory).
If an agent has high memory usage, you can try triggering GC manually (if not already forced) by sending a USR2 signal or using Node inspector. But with FORCE_GC=true, the system might already call GC periodically (perhaps logged as something like “[GC] performed”).
Also consider CPU: run top -b -n1 | grep node to see CPU usage of each process if needed. All should be low when idle. If any is consistently high (and not actually doing anything), it might be stuck or busy-waiting – investigate its log or stack.
Phase 7 Success Criteria:
Every agent has the Telegram client initialized (no agent relying solely on fallback due to missing global client) ✅
All agents successfully loaded their bot tokens (no token load failures) ✅
Memory usage of agents remains in a reasonable range and not continuously growing ✅
No out-of-memory or garbage-collection-related errors observed ✅
If all looks good, the system is stable from a technical standpoint. We can proceed to a live test with actual Telegram messaging.
🧪 Phase 8: Full Integration Live Test
Finally, we perform a live test by sending a message in the actual Telegram group and observing the bots' interactions in real-time, as well as their heartbeats and connectivity after some time.
Note: This phase requires the bots to be configured in a real Telegram group (with the group ID -1002550618173 as used in env). All bots should be added to that group, and privacy mode disabled if we expect them to see all messages. Ensure this is set up beforehand.
8.1 Live Group Chat Test
Use a Telegram client (app or web) to send a test message in the group where the bots reside. For example, send: "Hello Valhalla bots, are you alive?" in the group chat. Then monitor the system:
bash
Copy
Edit
# Monitor the relay and agent logs in real-time for relevant events (use Ctrl+C to stop tailing after observing)
tail -f /root/eliza/logs/relay-server.log /root/eliza/logs/*.log | grep -E "(Received|Forwarded|Found new messages|Sending reply)"
Watch the console output from the tail command as you send the message in Telegram. You should see lines indicating:
The bot that receives the message from Telegram (likely all bots if privacy is off, or one if it was directed).
That bot (or multiple) forwarding the message to relay (Forwarded to relay).
The relay log showing it broadcasting or handling the message.
Other bots picking up the message (Found new messages via relay).
Possibly each bot deciding whether to respond (Sending reply if they do).
Let the bots converse for a minute if they auto-respond or try asking questions. Observe any errors or odd behavior in the logs via the tail. Stop the tail with Ctrl+C when done. Expected Results:
When a human message is posted, at least one bot should log a "Received Telegram message" (each bot with privacy mode off will log it, actually).
All bots forward it to the relay (they might all do it, or some logic might only have one forward to avoid duplication – depends on implementation).
The relay log will likely show multiple receipts of the same message (if all forwarded) or one. It may also show distribution events.
Other bots will get the message via relay (if they weren't all forwarding, then those that didn't forward will get it from relay).
At least one bot should respond in the Telegram group (you should see the message appear in the chat from one of the bot accounts). This corresponds to "Sending reply" in that bot's log, and the relay might also handle that outgoing message or not (outgoing replies can go directly to Telegram since the bot can send to the group).
No crashes or error spikes when doing a live interaction. The system should handle it gracefully as it did with our simulated test.
If bots are not responding in the chat:
It could be a configuration where they only talk when mentioned or there's a specific trigger. Check if maybe adding a trigger word or directly addressing a bot (e.g. "/ping") elicits a response.
The main goal here is not the conversation content but verifying that under real conditions the system stays stable and routes messages appropriately. Even if they stay silent, check logs to confirm they saw the message.
If bots didn't see the message, ensure they have permission (privacy mode off) to read group messages from others. That is a Telegram bot setting. If off, they will get messages from users. They still won't get messages from other bots (that's what relay is for).
If no logs appear for the message at all, then something is off in the integration. Possibly the group ID is wrong or not properly configured. Double-check the TELEGRAM_GROUP_IDS env matches the actual group’s ID. If not, update and restart bots with the correct ID so they know to pay attention to that chat.
8.2 Heartbeat and Final Health Check
After the system has been running for a while (and after the live test), perform one more health check for all components:
bash
Copy
Edit
# Check the relay for final status of agents
curl -s http://localhost:4000/health | tee /root/eliza/logs/final_health_check.log

# Check each agent's heartbeat logs (if they emit heartbeat periodically)
for agent in eth_memelord_9000 bag_flipper_9000 linda_evangelista_88 vc_shark_99 code_samurai_77 bitcoin_maxi_420; do
  echo "---- ${agent}: heartbeat ----"
  grep -i "heartbeat" /root/eliza/logs/${agent}.log | tail -n 2
done
Many multi-agent or client systems have a heartbeat to show they are alive and still connected (maybe pinging the relay or similar). If the code has such logging, this will catch the last few heartbeat entries.
We already know the relay health from earlier; this is just final confirmation that it still sees everyone.
Expected Results:
The relay health now (final check) should confirm all agents connected (as in Phase 5).
Each agent log likely has some heartbeat or keep-alive message (maybe something like [PLUGIN][VALHALLA] heartbeat every X seconds). We should see recent timestamps indicating they are still active.
If no heartbeat logs exist, it might not have that feature; then rely on the relay health and the fact that logs are still updating during conversation as evidence they are alive.
System remains stable for at least 10+ minutes (we haven't explicitly waited 10 minutes, but if you did the live test and maybe let them chat a bit, that could cover it; otherwise simply continue to monitor for that duration).
Phase 8 Success Criteria:
A real Telegram message to the group is processed by the system ✅
At least one bot responds in the group (verifying end-to-end functionality) ✅
Relay server logs reflect the message routing activity for the live message ✅
All agents remain connected and no crashes occur during the live interaction ✅
Heartbeat or health checks after some time show all agents still active ✅
Finally, we can declare the system fully operational if all the above criteria across phases are met.
🏆 Complete System Success Criteria
The Valhalla multi-agent system is fully debugged and operational when:
All 6 agents run continuously without errors.
No agent exits or crashes upon startup or during operation.
Logs show each agent initialized correctly (plugins loaded, token and client OK).
All agents are registered with the relay server.
Relay health or logs confirm connections from all agents.
No authentication issues between agents and relay.
Agents can see and process messages from other agents.
A message from one agent (or injected on its behalf) propagates so others log it.
Relay effectively distributes messages to all participants.
Agents respond to messages through Telegram.
When a human user sends a message in the group, agents generate appropriate responses (at least one agent replies).
These replies are visible in the Telegram group (meaning the Telegram API send works and bots aren't muted etc.).
No critical memory leaks or OOM errors occur.
Memory usage stays within expected bounds over time.
The FORCE_GC ensures garbage does not accumulate indefinitely.
The system can run for extended periods (10+ minutes as a baseline in testing, but ideally hours/days in production) without degradation.
Stable operation under load.
The system remains stable during continuous interaction for at least 10 minutes without any agent disconnecting or any service crashing.
Heartbeat logs or similar confirm ongoing liveness.
If any issues arise, refer to the troubleshooting guide below for targeted diagnostics and solutions.
🛠 Troubleshooting Guide
Issue	Diagnosis Steps	Solution (Actions)
Agent fails to start (crashes)	Check the agent’s log file for errors or stack trace.	Fix according to error: e.g., missing file (add it), syntax error (patch code), module not found (build/link the module), token missing (export it), etc., then restart that agent.
SQLite connection errors	Look for SQLITE_ERROR or database errors in logs.	Ensure USE_IN_MEMORY_DB=true is set (as we did). If persistent storage is needed later, verify DB path exists and permissions. For now, using memory DB avoids file locks.
Missing character file	Agent log error about file not found for character JSON.	Copy the missing JSON into the expected folder (packages/agent/src/characters). We did this in Phase 1.5; double-check file name matches exactly (including underscores etc.). Restart agent after adding file.
Port conflict (EADDRINUSE)	Agent or relay log shows address in use.	Use lsof -i:<port> to find the process holding it, kill it if safe. Adjust FORCE_EXACT_PORT or change port if necessary and update accordingly. Our plan frees ports at start; ensure no other services inadvertently started on those ports.
Telegram bot not responding	No response in chat, log shows Failed to load bot token.	Likely token env not set or name mismatch. Export the correct token env var (both TELEGRAM_BOT_TOKEN_* and <ID>_BOT_TOKEN if needed) and restart agent. Ensure BotFather-provided token is correct.
Agent not receiving messages	The agent never logs incoming messages (from humans or relay).	If it's not seeing human messages, check that bot’s privacy mode is off and it’s an admin or allowed to read group messages. If not receiving other bots’ messages, check relay connectivity and whether its plugin is using fallback (if so, it won’t get other bots’ messages). Ensure global client injection (Phase 7.1) succeeded for that agent; if not, try restarting it after others (to avoid race).
Relay server connection fails	Agent log shows unable to connect or auth fail to relay.	Verify the RELAY_AUTH_TOKEN in agent env matches what relay server expects. Also ensure relay is running and accessible (correct URL). If running on a different host or container, ensure network connectivity.
Message not relayed	Agent sends message but others don’t see it; relay log quiet.	The sending agent might not be forwarding to relay. Confirm that agent’s plugin config knows the message is in a group that should be relayed (we set TELEGRAM_GROUP_IDS). Also ensure no logic is skipping relay for certain messages. If needed, enforce that any bot-originated message triggers a relay broadcast.
Excessive GC / slow performance	Logs show very frequent [GC] or high CPU usage.	FORCE_GC=true will cause more GC runs – this prevents leaks but may cause minor hitches. It’s acceptable in debug. If performance is an issue, consider disabling forced GC once leaks are resolved, or tune the frequency. Also check if any agent is logging too much (debug mode); consider using a lower log level in production.
Lockfile or module version issues	Errors about version mismatch or incompatible module.	Run pnpm install again to ensure all packages match the lockfile. If a particular package version is wrong, adjust package.json or overrides and rebuild. Consistency in dependency versions across the monorepo is key.
ts-node related startup error	Agent fails to start with an ESM loader complaint.	If our start-agent-with-patches.js approach fails, use the fallback Option C: apply patches, then pnpm --filter @elizaos/agent start ... to run the compiled agent. This avoids ts-node entirely. Or try Option B: explicitly use node --loader ts-node/esm if ts-node is installed. We primarily avoided this by pre-building everything.
📝 Environment Variables Cheatsheet
For reference, ensure the following environment variables are correctly set for each agent:
bash
Copy
Edit
# Core configuration
AGENT_ID=<agent_id>                       # e.g., "bitcoin_maxi_420", unique per agent
USE_IN_MEMORY_DB=true                     # Avoid SQLite file issues by using memory DB
RELAY_SERVER_URL="http://localhost:4000"  # URL of the relay server
RELAY_AUTH_TOKEN="elizaos-secure-relay-key" # Authorization token for relay communication
TELEGRAM_GROUP_IDS="-1002550618173"       # Telegram group ID where agents operate (as a string)
FORCE_EXACT_PORT=true                     # Ensure the agent uses the specified port (no auto-port switching)
DISABLE_POLLING=false                     # Allow Telegram polling (false means polling is active, which is normal for receiving updates)
FORCE_GC=true                             # Enable forced garbage collection at intervals (for debugging memory leaks)

# Telegram Bot Tokens (one per agent, keep them secret!)
# Use the agent’s uppercase ID in the variable name:
TELEGRAM_BOT_TOKEN_ETH_MEMELORD_9000="<token_value>"
TELEGRAM_BOT_TOKEN_BAG_FLIPPER_9000="<token_value>"
TELEGRAM_BOT_TOKEN_LINDA_EVANGELISTA_88="<token_value>"
TELEGRAM_BOT_TOKEN_VC_SHARK_99="<token_value>"
TELEGRAM_BOT_TOKEN_BITCOIN_MAXI_420="<token_value>"
TELEGRAM_BOT_TOKEN_CODE_SAMURAI_77="<token_value>"

# Additionally, for plugin compatibility, you can set each ID_BOT_TOKEN:
ETH_MEMELORD_9000_BOT_TOKEN="<token_value>"
BAG_FLIPPER_9000_BOT_TOKEN="<token_value>"
LINDA_EVANGELISTA_88_BOT_TOKEN="<token_value>"
VC_SHARK_99_BOT_TOKEN="<token_value>"
BITCOIN_MAXI_420_BOT_TOKEN="<token_value>"
CODE_SAMURAI_77_BOT_TOKEN="<token_value>"
Usage: Before starting agents, export the core variables and the specific bot token for that agent. Our Phase 5 script assumes you have all TELEGRAM_BOT_TOKEN_* exported in the environment it runs in. If not, you can source a file that contains them. With this plan executed step-by-step, the ElizaOS Valhalla multi-agent Telegram bot system should be fully debugged and stable. Each phase builds confidence in the next, and by the end, all known blockers (SQLite errors, path issues, token access, client injection, ts-node troubles, build omissions, lockfile mismatches, port conflicts) are resolved, and the system is robust against race conditions and memory leaks. Proceed to maintain and monitor the system during real conversations, and be ready to iterate on any bot-specific logic or AI output issues, which are outside the scope of this technical deployment debug plan. Good luck conquering Valhalla!

Sources






