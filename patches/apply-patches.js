/**
 * Apply Patches
 * 
 * This script loads and applies all the necessary patches for the ElizaOS runtime.
 * It's designed to be run before starting the agent to ensure all patches are applied.
 */

// ESM version of apply-patches.js

// Import necessary modules if needed (e.g., path, fs - ensure they work in ESM)
// import path from 'path';
// import fs from 'fs';

// Function to apply patches
async function applyPatches() {
  console.log("🔧 Applying all ElizaOS runtime patches...");
  let runtime = null;

  // Apply SQLite Path Fix
  const sqliteFix = await import("./sqlite-path-fix.js");
  if (sqliteFix && typeof sqliteFix.applyFix === 'function') {
    await sqliteFix.applyFix();
  }

  // Apply In-Memory DB Fix
  const memoryFix = await import("./in-memory-db-fix.js");
  if (memoryFix && typeof memoryFix.applyFix === 'function') {
    await memoryFix.applyFix();
  }

  // Apply Relay Config Fix
  const relayConfigFix = await import("./relay-config-fix.js");
  if (relayConfigFix && typeof relayConfigFix.applyFix === 'function') {
    await relayConfigFix.applyFix();
  }

  // Attempt to Initialize Telegram Client
  try {
    console.log("🔧 Attempting to initialize Telegram client...");
    const telegramClientModule = await import("@elizaos/client-telegram");
    const telegramClient = telegramClientModule.default; // Assuming default export is singleton
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
    console.error("❌ Failed to load or initialize @elizaos/client-telegram:", err.message);
  }

  // Apply Runtime Patch (makes runtime global)
  console.log("🔧 Applying runtime patch...");
  try {
    const runtimePatch = await import("./runtime-patch.js");
    if (runtimePatch && typeof runtimePatch.applyPatch === 'function') {
      runtime = await runtimePatch.applyPatch();
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
  if (globalThis.__elizaRuntime && globalThis.__elizaRuntime.clients) {
    try {
      const telegramClientModule = await import("@elizaos/client-telegram");
      const telegramClient = telegramClientModule.default;
      if (telegramClient && !globalThis.__elizaRuntime.clients.telegram) {
        globalThis.__elizaRuntime.clients.telegram = telegramClient;
        console.log("✅ Injected initialized Telegram client into global runtime.");
      }
    } catch (err) {
      console.warn("⚠️ Could not load telegram client to inject into runtime.");
    }
  } else {
    console.warn("⚠️ Global runtime or runtime.clients not available for Telegram client injection.");
  }

  // Register handleMessage action
  if (runtime && typeof runtime.registerAction === 'function') {
    try {
      console.log("🔌 Registering action: handleMessage");
      const handleMessageModule = await import("./actions/handleMessage.js"); // Assuming path and ESM export
      if (handleMessageModule && handleMessageModule.handleMessage) {
        runtime.registerAction({
          name: "handleMessage",
          description: "Processes an incoming message",
          handler: handleMessageModule.handleMessage,
          similes: [],
          examples: [],
          validate: async () => true,
        });
        console.log("✅ Registered handleMessage as a formal runtime action");
      } else {
        console.error("❌ handleMessage module or function not found.");
      }
    } catch (error) {
      console.error("❌ Failed to register handleMessage action:", error);
    }
  } else {
    console.warn("⚠️ Runtime not available or registerAction not found, skipping handleMessage registration.");
  }

  // Apply Relay Fixes
  const relayFixes = await import("./relay-fixes.js");
  if (relayFixes && typeof relayFixes.applyFix === 'function') {
    await relayFixes.applyFix(runtime);
  }

  console.log("✅ All patches applied successfully");
}

// Execute patching
applyPatches().catch(error => {
  console.error("❌ Patching process failed:", error);
  process.exit(1);
});

// For scripts that might import this, indicate completion
// export const patchingComplete = true; // Use export for ESM
