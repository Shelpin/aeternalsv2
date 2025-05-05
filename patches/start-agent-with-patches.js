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
    // 📍 Normalize AGENT_ID from --characters argument if not set
    if (!process.env.AGENT_ID && characterFiles.length > 0) {
      const agentId = path.basename(characterFiles[0], '.json');
      process.env.AGENT_ID = agentId;
      console.log(`🔑 AGENT_ID set to ${agentId} (derived from characters path)`);
    }

    // 📂 Step 2: Enforce new database path for agent startup
    if (!process.env.SQLITE_FILE && !process.env.DATABASE_PATH) {
      console.warn('⚠️ No DB path specified; defaulting to multiagent.db');
      process.env.SQLITE_FILE = path.resolve(__dirname, '../packages/agent/data/multiagent.db');
    } else {
      process.env.SQLITE_FILE = process.env.SQLITE_FILE || process.env.DATABASE_PATH;
    }

    // 🔑 Step 3: Normalize Telegram token naming
    const agentId = process.env.AGENT_ID;
    if (agentId) {
      const tokenVar = `TELEGRAM_BOT_TOKEN_${agentId}`;
      const mappedToken = process.env[tokenVar];
      if (mappedToken) {
        process.env.TELEGRAM_BOT_TOKEN = mappedToken;
        console.log(`🔑 Mapped ${tokenVar} -> TELEGRAM_BOT_TOKEN`);
      } else {
        console.warn(`⚠️ Environment variable ${tokenVar} is not defined, leaving TELEGRAM_BOT_TOKEN as is`);
      }
    } else {
      console.warn('⚠️ AGENT_ID not set; cannot normalize Telegram token naming');
    }

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

    // Convert character file paths to absolute paths
    const absoluteCharacterFiles = characterFiles.map(file => path.resolve(rootDir, file));
    const absoluteCharactersArg = absoluteCharacterFiles.length > 0
      ? `--characters=${absoluteCharacterFiles.join(',')}`
      : '';

    // Prepare arguments for the spawned process, replacing the characters arg if needed
    const agentArgs = args.map(arg => {
      if (arg.startsWith('--characters=')) {
        return absoluteCharactersArg;
      }
      return arg;
    }).filter(arg => arg !== ''); // Filter out empty string if original was removed

    // If the original args didn't have --characters, but we derived it, add it
    if (!charactersArg && absoluteCharactersArg) {
      agentArgs.push(absoluteCharactersArg);
    }

    console.log(`🔧 Absolute Character files Arg: ${absoluteCharactersArg || 'None'}`);

    // --- Start Real Agent Spawn --- 
    console.log('🚀 Spawning real agent process directly...');

    const agentDistPath = path.resolve(rootDir, 'packages/agent/dist/index.js');
    console.log(`🔧 Agent executable path: ${agentDistPath}`);

    // Execute node directly with the agent script and modified arguments
    const agentProcess = spawn('node', [agentDistPath, ...agentArgs], {
      stdio: 'inherit', // Show agent output directly in console
      // Set the CWD to the agent's package directory so relative paths *within* the agent code work as expected
      cwd: path.resolve(rootDir, 'packages/agent'),
      env: {
        ...process.env, // Pass existing env vars (includes AGENT_ID, TOKEN, etc.)
        VALHALLA_PATCHED: 'true', // Add a flag if needed
        // NODE_OPTIONS should ideally be inherited or set globally, 
        // but include it if necessary. Be careful with multiple --require flags.
        // NODE_OPTIONS: '--require dotenv/config' // Keep if needed
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