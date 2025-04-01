/**
 * Relay Server Configuration Fix
 * This patch ensures that the relay server URL is correctly set
 */

console.log('[RELAY-CONFIG-FIX] Setting explicit Relay Server URL');

/**
 * Set the relay server URL based on environment or use default with configurable port
 */
export function configureRelayServer(relayPort = 4000) {
  const relayServerUrl = process.env.RELAY_SERVER_URL || `http://localhost:${relayPort}`;
  process.env.RELAY_SERVER_URL = relayServerUrl;
  console.log(`[RELAY-CONFIG-FIX] Using relay server URL: ${relayServerUrl}`);
  
  // Patch any relay-specific code that might be using hardcoded URLs
  if (globalThis.__elizaRuntime) {
    console.log('[RELAY-CONFIG-FIX] Patching ElizaOS runtime with correct relay URL');
    globalThis.__elizaRuntime.relayServerUrl = relayServerUrl;
  }
  
  return relayServerUrl;
}

// Apply the configuration immediately
const configuredUrl = configureRelayServer();

// Export the configured URL
export default configuredUrl; 