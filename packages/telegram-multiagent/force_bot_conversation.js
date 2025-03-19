#!/usr/bin/env node

const axios = require('axios');
const { execSync } = require('child_process');

// Configuration
const GROUP_ID = "-1002550618173";
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const RELAY_SERVER = "http://207.180.245.243:4000";

// Tokens are loaded from environment variables
const VC_SHARK_TOKEN = process.env.TELEGRAM_BOT_TOKEN_VCShark99;
const LINDA_TOKEN = process.env.TELEGRAM_BOT_TOKEN_LindAEvangelista88;

// Ensure tokens are available
if (!VC_SHARK_TOKEN || !LINDA_TOKEN) {
  console.error("Error: Bot tokens not found in environment variables.");
  process.exit(1);
}

// Set the FORCE_BOT_RESPONSES environment variable for all agents
console.log("🔧 Setting FORCE_BOT_RESPONSES=true for all agents...");
execSync("export FORCE_BOT_RESPONSES=true");

// Restart the agents with the new environment variable
console.log("🔄 Applying changes to agents...");
console.log("📋 Building the telegram-multiagent package...");
execSync("cd /root/eliza/packages/telegram-multiagent && npm run build", { stdio: 'inherit' });

// Setup logging directory for test output
console.log("📊 Setting up log monitoring...");
execSync("mkdir -p /tmp/bot-test-logs", { stdio: 'inherit' });

// Function to send a message from one bot to another
async function sendMessage(token, fromBot, toBot, message) {
  console.log(`📤 ${fromBot} is sending message to ${toBot}: "${message}"`);
  
  try {
    const response = await axios.post(
      `${TELEGRAM_API_BASE}${token}/sendMessage`,
      {
        chat_id: GROUP_ID,
        text: message
      }
    );
    
    console.log(`✅ Message sent successfully (ID: ${response.data.result.message_id})`);
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error sending message: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Function to check if a bot has responded
async function waitForResponse(botName, timeoutSeconds = 30) {
  console.log(`⏳ Waiting up to ${timeoutSeconds} seconds for ${botName} to respond...`);
  
  // Create a timestamp for log checking
  const timestamp = new Date().toISOString();
  
  // Check logs repeatedly
  const startTime = Date.now();
  let found = false;
  
  while (Date.now() - startTime < timeoutSeconds * 1000) {
    try {
      // Check the logs for recent messages from this bot
      const logOutput = execSync(
        `grep -A 5 "from.*${botName}" /root/eliza/logs/relay_server.log | grep -v "No new updates" | tail -20`
      ).toString();
      
      if (logOutput.includes('message')) {
        console.log(`✅ ${botName} has responded!`);
        console.log(logOutput);
        found = true;
        break;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      // If grep doesn't find anything, it returns an error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (!found) {
    console.log(`⚠️ ${botName} did not respond within ${timeoutSeconds} seconds`);
  }
  
  return found;
}

// Main function to execute the test
async function runTest() {
  console.log("🚀 Starting bot communication test...");
  
  try {
    // Start monitoring logs in a separate process
    execSync(
      `cd /root/eliza && ./monitor_agents.sh -v > /tmp/bot-test-logs/full_logs.txt &`,
      { stdio: 'inherit' }
    );
    
    console.log("\n📣 PHASE 1: VCShark sends a message to Linda");
    // First message: VCShark to Linda about fashion
    await sendMessage(
      VC_SHARK_TOKEN,
      "VCShark",
      "Linda",
      "@linda_evangelista_88 @LindAEvangelista88_bot Hey Linda, what are your thoughts on sustainable fashion trends for 2025? #FashionTalk"
    );
    
    // Wait for Linda to respond
    const lindaResponded = await waitForResponse("linda_evangelista_88", 30);
    
    if (!lindaResponded) {
      // Try a direct approach via the relay server
      console.log("\n📣 PHASE 1b: Trying direct relay server approach...");
      
      try {
        console.log("Sending direct message to relay server...");
        const relayResponse = await axios.post(
          `${RELAY_SERVER}/message`,
          {
            sender_agent_id: "vc_shark_99",
            content: "@linda_evangelista_88 Direct relay message: What fashion trends should I invest in for 2025?",
            chat_id: GROUP_ID,
            message_id: Date.now().toString(),
            from: {
              id: 7941434157,
              is_bot: true,
              first_name: "VCShark99",
              username: "VCShark99_bot"
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.RELAY_AUTH_TOKEN || 'elizaos-secure-relay-key'}`
            }
          }
        );
        
        console.log(`✅ Direct relay message sent: ${JSON.stringify(relayResponse.data)}`);
      } catch (error) {
        console.error(`❌ Error with direct relay: ${error.message}`);
      }
      
      // Wait again for Linda to respond
      await waitForResponse("linda_evangelista_88", 30);
    }
    
    console.log("\n📣 PHASE 2: Linda sends a message to VCShark");
    // Second message: Linda to VCShark about investments
    await sendMessage(
      LINDA_TOKEN,
      "Linda",
      "VCShark",
      "@vc_shark_99 @VCShark99_bot As a VC, what startups in the fashion tech space would you recommend investing in? #InvestmentAdvice"
    );
    
    // Wait for VCShark to respond
    await waitForResponse("vc_shark_99", 30);
    
    console.log("\n📊 TEST COMPLETE - Check the logs for detailed information");
    console.log("Full logs available at: /tmp/bot-test-logs/full_logs.txt");
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

// Run the test
runTest(); 