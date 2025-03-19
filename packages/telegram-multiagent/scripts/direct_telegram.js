#!/usr/bin/env node

/**
 * Enhanced Direct Telegram Script
 * 
 * This script sends messages directly to the Telegram relay server
 * for testing bot-to-bot communication.
 * 
 * Usage:
 *   node direct_telegram.js --server=http://localhost:4000 --token=auth-token --from=bot_name 
 *     --group=-1002550618173 --text="Hello @otherbot, how are you?"
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Default configuration
const defaultConfig = {
  server: 'http://207.180.245.243:4000',
  token: 'elizaos-secure-relay-key',
  from: '',
  group: '',
  text: '',
  debug: false,
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...defaultConfig };

  args.forEach(arg => {
    if (arg.startsWith('--server=')) {
      config.server = arg.split('=')[1];
    } else if (arg.startsWith('--token=')) {
      config.token = arg.split('=')[1];
    } else if (arg.startsWith('--from=')) {
      config.from = arg.split('=')[1];
    } else if (arg.startsWith('--group=')) {
      config.group = arg.split('=')[1];
    } else if (arg.startsWith('--text=')) {
      config.text = arg.substring('--text='.length);
    }
  });

  return config;
}

// Send message to relay server
async function sendRelayMessage(config) {
  console.log('📤 Sending relay message with configuration:');
  console.log(JSON.stringify(config, null, 2));

  return new Promise((resolve, reject) => {
    try {
      // Create the message payload in the format expected by the relay server
      const messageId = Date.now();
      const chatId = parseInt(config.group, 10);
      
      // First prepare the message in the format expected by the TelegramRelay.handleIncomingMessage method
      // This is based on the standardizedMessage format in that method
      const directMessage = {
        message_id: messageId,
        chat_id: chatId,              // This is used directly by TelegramMultiAgentPlugin
        groupId: chatId.toString(),   // This is set by TelegramRelay.handleIncomingMessage
        chat: {                       // This is expected by some parts of the code
          id: chatId                  
        },
        from: {
          id: Math.floor(Math.random() * 1000000),
          is_bot: true,
          first_name: config.from,
          username: config.from
        },
        date: Math.floor(Date.now() / 1000),
        text: config.text,            // Original Telegram format
        content: config.text,         // Used by TelegramMultiAgentPlugin
        sender_agent_id: config.from  // Critical for bot-to-bot messages
      };
      
      // For the relay server /sendMessage endpoint
      const message = {
        agent_id: config.from,        // Agent sending the message
        token: config.token,          // Auth token
        chat_id: chatId,              // Chat ID
        text: config.text,            // Message text
        message: directMessage        // The actual message payload
      };
      
      // Serialize the payload
      const data = JSON.stringify(message);
      
      // Parse the server URL
      const url = new URL('/sendMessage', config.server);
      
      // Determine which HTTP client to use
      const client = url.protocol === 'https:' ? https : http;
      
      // Configure the HTTP request
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token}`,
          'Content-Length': Buffer.byteLength(data)
        }
      };

      // Send the request
      const req = client.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('✅ Message sent successfully to relay server!');
            try {
              const parsedResponse = JSON.parse(responseData);
              console.log('📊 Server response:', parsedResponse);
              resolve(parsedResponse);
            } catch (e) {
              console.log('📄 Server response (raw):', responseData);
              resolve(responseData);
            }
          } else {
            console.error(`❌ HTTP Error: ${res.statusCode} ${res.statusMessage}`);
            console.error('Error response:', responseData);
            reject(new Error(`HTTP Error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (e) => {
        console.error('❌ Request error:', e.message);
        reject(e);
      });

      // Write the payload and complete the request
      req.write(data);
      req.end();

    } catch (error) {
      console.error('❌ Error sending message:', error.message);
      reject(error);
    }
  });
}

// Main execution
async function main() {
  console.log('🤖 Enhanced Direct Telegram Script');
  console.log('-------------------------------');
  
  try {
    const config = parseArgs();
    await sendRelayMessage(config);
    
    console.log('\n📝 Testing Instructions:');
    console.log('1. Check agent logs for activity:');
    console.log('   tail -f /root/eliza/logs/*.log | grep -E "\\[BOT MSG DEBUG\\]|shouldRespond"');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Execute main function
main().catch(console.error); 