#!/usr/bin/env node

/**
 * ElizaOS Agent Start Script with Runtime Patches
 * This script applies the necessary patches before starting the agent
 */

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments to pass to the agent
const args = process.argv.slice(2);

// Extract character files from arguments
const charactersArg = args.find(arg => arg.startsWith('--characters='));
const charactersValue = charactersArg ? charactersArg.split('=')[1] : '';
const characterFiles = charactersValue ? charactersValue.split(',') : [];

// Log the process
console.log('🚀 Starting ElizaOS agent with Valhalla runtime patches');
console.log(`📂 Working directory: ${process.cwd()}`);
console.log(`🔧 Environment variables loaded: ${process.env.USE_OPENAI_EMBEDDING ? 'OpenAI' : 'Ollama'} embedding enabled`);
console.log(`🔧 Character files: ${characterFiles.join(', ') || 'None provided'}`);

async function main() {
  try {
    // --- Start of Merged Patch Logic ---
    console.log("🔧 Applying all ElizaOS runtime patches directly...");
    let runtime = null;

    // Apply SQLite Path Fix
    try {
      const sqliteFix = await import("./sqlite-path-fix.js");
      if (sqliteFix && typeof sqliteFix.applyFix === 'function') {
        await sqliteFix.applyFix();
      }
    } catch (e) { console.error("Error applying sqlite-path-fix:", e); }

    // Apply In-Memory DB Fix
    try {
      const memoryFix = await import("./in-memory-db-fix.js");
      if (memoryFix && typeof memoryFix.applyFix === 'function') {
        await memoryFix.applyFix();
      }
    } catch (e) { console.error("Error applying in-memory-db-fix:", e); }

    // Apply Relay Config Fix
    try {
      const relayConfigFix = await import("./relay-config-fix.js");
      if (relayConfigFix && typeof relayConfigFix.applyFix === 'function') {
        await relayConfigFix.applyFix();
      }
    } catch (e) { console.error("Error applying relay-config-fix:", e); }

    // Attempt to Initialize Telegram Client
    let telegramClient = null; // Define variable outside try block
    try {
      console.log("🔧 Attempting to initialize Telegram client...");
      // Use relative path for import
      const telegramClientModule = await import("../packages/clients/telegram/dist/index.js");
      telegramClient = telegramClientModule.default; // Assign to outer variable
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (telegramClient && typeof telegramClient.initialize === 'function' && token) {
        telegramClient.initialize(token);
        console.log("✅ Telegram client singleton initialized with token.");
      } else if (!token) {
        console.warn("⚠️ TELEGRAM_BOT_TOKEN environment variable not set. Cannot initialize Telegram client.");
      } else {
        console.warn("⚠️ Could not find exported telegramClient or initialize method.");
      }
    } catch (err) {
      console.error("❌ Failed to load or initialize Telegram client (relative path):", err);
    }

    // Apply Runtime Patch (makes runtime global)
    console.log("🔧 Applying runtime patch...");
    try {
      const runtimePatch = await import("./runtime-patch.js");
      if (runtimePatch && typeof runtimePatch.applyPatch === 'function') {
        runtime = await runtimePatch.applyPatch(); // Assign to local runtime variable
        console.log("✅ Runtime patch applied and made globally available");
        console.log(`🔧 Checking globalThis after patch: ${globalThis.__elizaRuntime ? 'SET' : 'NOT SET'}`);
        if (globalThis.__elizaRuntime) {
          console.log(`🔧 Global runtime name: ${globalThis.__elizaRuntime.name || 'Unknown Name'}`);
        }
      } else {
        console.error("❌ Runtime patch module or applyPatch function not found.");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ Failed to apply runtime patch:", error);
      process.exit(1);
    }

    // Now try injecting the initialized client into the now-global runtime
    // Use the telegramClient variable defined above
    if (globalThis.__elizaRuntime && globalThis.__elizaRuntime.clients && telegramClient) {
      if (!globalThis.__elizaRuntime.clients.telegram) {
        globalThis.__elizaRuntime.clients.telegram = telegramClient;
        console.log("✅ Injected initialized Telegram client into global runtime.");
      } else {
        console.log("ℹ️ Telegram client already present in global runtime.");
      }
    } else {
      if (!telegramClient) {
        console.warn("⚠️ Telegram client failed to load, cannot inject into runtime.");
      } else {
        console.warn("⚠️ Global runtime or runtime.clients not available for Telegram client injection.");
      }
    }

    // Register handleMessage action
    if (runtime && typeof runtime.registerAction === 'function' && typeof runtime.handleMessage === 'function') {
      try {
        console.log("🔌 Registering action: handleMessage (using runtime method)");
        runtime.registerAction({
          name: "handleMessage",
          description: "Processes an incoming message (runtime core)",
          handler: runtime.handleMessage.bind(runtime), // Use runtime's own method, bind this
          similes: [],
          examples: [],
          validate: async () => true,
        });
        console.log("✅ Registered runtime.handleMessage as a formal runtime action");
      } catch (error) {
        console.error("❌ Failed to register handleMessage action:", error);
      }
    } else {
      console.warn("⚠️ Local runtime variable, registerAction, or handleMessage not available, skipping handleMessage registration.");
    }

    // Apply Relay Fixes
    try {
      console.log("🔧 Applying relay fixes..."); // Add log before import
      // Import the module to execute its patching logic immediately
      await import("./relay-fixes.js");
      // relay-fixes.js logs its own success/failure
    } catch (e) {
      console.error("❌ Error importing/applying relay-fixes:", e);
    }

    console.log("✅ All patches applied successfully (within start-agent script)");
    // --- End of Merged Patch Logic ---

    // Verify that the runtime is available (using the same check as before)
    if (!globalThis.__elizaRuntime) {
      throw new Error('❌ Runtime not initialized by patches (checked after merge)');
    }

    console.log(`✅ runtime.handleMessage is now ${typeof globalThis.__elizaRuntime.handleMessage === 'function' ? 'available' : 'not available'}`);

    // --- Start Real Agent Spawn --- 
    console.log('🚀 Spawning real agent process...');
    const npmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

    // Start the agent with the same arguments passed to this script
    const agentProcess = spawn(npmCmd, ['--filter', '@elizaos/agent', 'start', ...args], {
      stdio: 'inherit', // Show agent output directly in console
      cwd: rootDir, // Ensure it runs from the project root
      env: {
        ...process.env, // Pass existing env vars (includes AGENT_ID, TOKEN, etc.)
        VALHALLA_PATCHED: 'true' // Add a flag if needed
      }
    });

    // Handle the agent process events
    agentProcess.on('close', (code) => {
      console.log(`Agent process exited with code ${code}`);
      // Optionally exit this script too, or just let it end
      // process.exit(code);
    });

    agentProcess.on('error', (err) => {
      console.error('❌ Failed to start agent process:', err);
      process.exit(1);
    });
    // --- End Real Agent Spawn --- 

  } catch (error) {
    // Catch errors from both patch application and simulation setup
    console.error('❌ Error in main function:', error);
    process.exit(1);
  }
}

main();