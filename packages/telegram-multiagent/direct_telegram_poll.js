#!/usr/bin/env node

const axios = require('axios');
const { execSync } = require('child_process');

// Configuration
const GROUP_ID = "-1002550618173";
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const RELAY_SERVER = "http://207.180.245.243:4000";
const POLL_INTERVAL_MS = 5000; // 5 seconds

// Token for the VCShark bot
const TOKEN = process.env.TELEGRAM_BOT_TOKEN_VCShark99;

// Authentication for relay server
const RELAY_AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN || 'elizaos-secure-relay-key';

if (!TOKEN) {
  console.error("Error: Bot token not found in environment variables.");
  process.exit(1);
}

let lastUpdateId = 0;

/**
 * Directly poll Telegram API for updates
 */
async function pollTelegramApi() {
  try {
    console.log(`\n📡 Polling Telegram API for updates (offset=${lastUpdateId})...`);
    
    const response = await axios.get(
      `${TELEGRAM_API_BASE}${TOKEN}/getUpdates?offset=${lastUpdateId}&timeout=30`
    );
    
    if (response.data.ok && response.data.result.length > 0) {
      console.log(`✅ Received ${response.data.result.length} updates from Telegram API`);
      console.log(JSON.stringify(response.data.result, null, 2));
      
      // Process each update
      for (const update of response.data.result) {
        // Update last update ID
        lastUpdateId = update.update_id + 1;
        
        if (update.message) {
          console.log(`📨 Processing message: ${JSON.stringify(update.message)}`);
          
          if (update.message.chat.id.toString() === GROUP_ID) {
            console.log(`📨 Message is for our group`);
            
            // Forward to relay server
            await forwardToRelayServer(update.message);
          }
        }
      }
    } else {
      console.log(`ℹ️ No new updates from Telegram API`);
    }
  } catch (error) {
    console.error(`❌ Error polling Telegram API: ${error.message}`);
    console.error(error.response?.data || "No response data");
  }
}

/**
 * Forward a message to our relay server
 */
async function forwardToRelayServer(message) {
  try {
    console.log(`🔄 Forwarding message to relay server...`);
    
    // Create a relay-compatible message
    const relayMessage = {
      update_id: Date.now(),
      message: {
        message_id: message.message_id,
        from: message.from,
        chat: message.chat,
        date: message.date,
        text: message.text
      }
    };
    
    // Send to relay server
    const response = await axios.post(
      `${RELAY_SERVER}/telegram-webhook`, 
      relayMessage,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RELAY_AUTH_TOKEN}`
        }
      }
    );
    
    console.log(`✅ Message forwarded to relay server: ${response.status} ${response.statusText}`);
    console.log(response.data);
  } catch (error) {
    console.error(`❌ Error forwarding to relay server: ${error.message}`);
    console.error(error.response?.data || "No response data");
  }
}

/**
 * Main polling loop
 */
async function startPolling() {
  console.log(`🚀 Starting Telegram direct polling service...`);
  console.log(`📡 Using Telegram API: ${TELEGRAM_API_BASE}${TOKEN}`);
  console.log(`🔄 Using relay server: ${RELAY_SERVER}`);
  console.log(`👥 For group ID: ${GROUP_ID}`);
  
  // Build our changes first
  try {
    console.log(`🛠️ Building telegram-multiagent package...`);
    execSync('cd /root/eliza/packages/telegram-multiagent && npm run build', { stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Build failed: ${error.message}`);
  }
  
  // Start polling loop
  setInterval(pollTelegramApi, POLL_INTERVAL_MS);
  
  // Do initial poll immediately
  await pollTelegramApi();
}

// Start the service
startPolling().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
}); 