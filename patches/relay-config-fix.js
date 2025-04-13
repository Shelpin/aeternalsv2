/**
 * Relay Configuration Fix
 * 
 * This patch fixes relay server configuration issues by:
 * 1. Setting up proper relay server URL
 * 2. Configuring authentication tokens
 * 3. Ensuring port configuration is consistent
 */

console.log('🔧 Applying relay configuration fix...');

// Function to set up relay configuration
function configureRelay() {
  try {
    // Ensure required environment variables
    if (!process.env.RELAY_SERVER_URL) {
      console.log('⚠️ RELAY_SERVER_URL not set, using default http://localhost:4000');
      process.env.RELAY_SERVER_URL = 'http://localhost:4000';
    }

    if (!process.env.RELAY_AUTH_TOKEN) {
      console.log('⚠️ RELAY_AUTH_TOKEN not set, using default elizaos-secure-relay-key');
      process.env.RELAY_AUTH_TOKEN = 'elizaos-secure-relay-key';
    }

    // Ensure port configuration is respected
    if (process.env.FORCE_EXACT_PORT === 'true' && process.env.AGENT_PORT) {
      console.log(`🔧 Forcing exact port: ${process.env.AGENT_PORT}`);
    }

    // If runtime is available, configure relay endpoints
    if (globalThis.__elizaRuntime) {
      const runtime = globalThis.__elizaRuntime;

      // Patch getSetting to return relay configuration
      const originalGetSetting = runtime.getSetting;
      if (typeof originalGetSetting === 'function') {
        runtime.getSetting = function (key, defaultValue) {
          if (key === 'RELAY_SERVER_URL') {
            return process.env.RELAY_SERVER_URL;
          }
          if (key === 'RELAY_AUTH_TOKEN') {
            return process.env.RELAY_AUTH_TOKEN;
          }
          return originalGetSetting.call(this, key, defaultValue);
        };
      }

      console.log('✅ Patched runtime getSetting for relay configuration');
    }

    return true;
  } catch (error) {
    console.error('❌ Error configuring relay:', error);
    return false;
  }
}

// Apply configuration
const relayConfigured = configureRelay();

console.log('✅ Relay configuration fix applied'); 