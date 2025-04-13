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
    console.log('🔧 Applying runtime patches...');

    // Apply all patches first
    await import('./apply-patches.js');
    console.log('✅ All patches applied successfully');

    // Verify that the runtime is available
    if (!globalThis.__elizaRuntime) {
      throw new Error('❌ Runtime not initialized by patches');
    }

    console.log(`✅ runtime.handleMessage is now ${typeof globalThis.__elizaRuntime.handleMessage === 'function' ? 'available' : 'not available'}`);

    // Create a simulated agent process for testing
    console.log('🚀 Starting simulated agent process...');

    // Verify environment variables
    console.log(`🔧 AGENT_ID: ${process.env.AGENT_ID || 'not set'}`);
    console.log(`🔧 AGENT_PORT: ${process.env.AGENT_PORT || 'not set'}`);
    console.log(`🔧 RELAY_SERVER_URL: ${process.env.RELAY_SERVER_URL || 'not set'}`);

    // If agent ID is set, run a longer simulation
    if (process.env.AGENT_ID) {
      console.log(`🚀 Starting agent: ${process.env.AGENT_ID}`);

      // Set an interval to simulate incoming messages from Telegram
      setInterval(() => {
        try {
          if (globalThis.__elizaTelegramClient && globalThis.__elizaTelegramClient.TelegramClient) {
            // Create a mock client instance
            const mockClient = new globalThis.__elizaTelegramClient.TelegramClient({
              token: 'test-token'
            });

            // Simulate an incoming message
            console.log('📱 Simulating an incoming Telegram message...');
            const mockMessage = {
              message_id: Date.now(),
              from: { id: 12345, username: 'test_user' },
              chat: { id: -1002550681173, type: 'group', title: 'Test Group' },
              text: 'Hello, agent!',
              date: Math.floor(Date.now() / 1000)
            };

            // Process the message with the runtime
            if (globalThis.__elizaRuntime && typeof globalThis.__elizaRuntime.handleMessage === 'function') {
              console.log('🧠 Processing message with runtime...');

              globalThis.__elizaRuntime.handleMessage({
                type: 'text',
                content: mockMessage.text,
                source: 'telegram',
                target: process.env.AGENT_ID,
                rawMessage: mockMessage
              }).then(response => {
                console.log(`🧠 Response from runtime: ${JSON.stringify(response).substring(0, 100)}...`);

                // Simulate sending a response back via Telegram
                mockClient.sendMessage(mockMessage.chat.id, response.content)
                  .then(result => {
                    console.log('📱 Mock response sent to Telegram');
                  })
                  .catch(err => {
                    console.error('❌ Error sending mock response:', err);
                  });
              }).catch(err => {
                console.error('❌ Error processing message with runtime:', err);
              });
            } else {
              console.log('⚠️ Runtime message handler not available');
            }
          } else {
            console.log('⚠️ Telegram client not available');
          }
        } catch (error) {
          console.error('❌ Error in simulation:', error);
        }
      }, 15000); // Every 15 seconds
    } else {
      console.log('⚠️ AGENT_ID not set, skipping message simulation');
    }

    // Keep the process running
    console.log('🚀 Agent simulation running...');

    // For a real agent, we would use spawn:
    /*
    const npmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    
    // Start the agent with the same arguments
    const agentProcess = spawn(npmCmd, ['--filter', '@elizaos/agent', 'start', ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        VALHALLA_PATCHED: 'true'
      }
    });
    
    // Handle the agent process events
    agentProcess.on('close', (code) => {
      console.log(`Agent process exited with code ${code}`);
      process.exit(code);
    });
    
    agentProcess.on('error', (err) => {
      console.error('Failed to start agent process:', err);
      process.exit(1);
    });
    */

  } catch (error) {
    console.error('❌ Error applying patches:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error in patch script:', err);
  process.exit(1);
});
