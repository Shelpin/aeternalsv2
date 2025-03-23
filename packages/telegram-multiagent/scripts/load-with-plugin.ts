import { AgentRuntime } from '@elizaos/core';
import { TelegramMultiAgentPlugin } from '../src';

async function main() {
  console.log('Starting Telegram Multi-Agent Plugin test...');
  
  // Create runtime
  const runtime = new AgentRuntime({
    token: process.env.TOKEN || 'dummy-token',
    serverUrl: process.env.SERVER_URL || 'http://localhost:3000'
  });
  
  // Create plugin instance
  const telegramPlugin = new TelegramMultiAgentPlugin();
  
  // Register the plugin
  telegramPlugin.register(runtime);
  
  // Initialize the plugin
  await telegramPlugin.initialize();
  
  console.log('Telegram Multi-Agent Plugin initialized');
  console.log('Press Ctrl+C to exit');
  
  // Handle SIGINT for clean shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT signal. Shutting down...');
    
    try {
      // Properly shutdown the plugin
      await telegramPlugin.shutdown();
      console.log('Plugin shutdown complete');
    } catch (error) {
      console.error('Error during plugin shutdown:', error);
    }
    
    // Exit process
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Error in main function:', error);
  process.exit(1);
}); 