/**
 * Default configuration for the Telegram Multi-Agent plugin
 */

export const config = {
  // Default configuration values
  enabled: true,
  typingSimulation: {
    enabled: true,
    baseTypingSpeedCPM: 800,  // Characters per minute
    randomVariation: 0.3     // Random factor (0.0-1.0)
  },
  conversationCheckIntervalMs: 60000,
  heartbeatInterval: 30000,
  pollingIntervalMs: 2000,
  maxRetries: 3,
  disablePolling: false,
  kickstarterConfig: {
    probabilityFactor: 0.2,
    minIntervalMs: 300000,
    includeTopics: true,
    shouldTagAgents: true,
    maxAgentsToTag: 2
  }
};

export default config; 