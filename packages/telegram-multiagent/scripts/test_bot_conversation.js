/**
 * Script to test bot-to-bot communication via the relay server
 * This sends a message from one bot to another to test if they can communicate
 */

const http = require('http');

// Configuration
const RELAY_SERVER_URL = 'http://localhost:4000';
const RELAY_AUTH_TOKEN = 'elizaos-secure-relay-key';
const GROUP_ID = -1002550618173;
const BOT_NAMES = {
  LINDA: 'linda_evangelista_88',
  VCSHARK: 'vc_shark_99',
  BITCOIN_MAXI: 'bitcoin_maxi_420',
  ETH_MEMELORD: 'eth_memelord_9000',
  BAG_FLIPPER: 'bag_flipper_9000'
};

// Verbose logging with timestamp
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Send a message to the relay server using Node's built-in http module
 * @param {string} fromBot - The bot sending the message
 * @param {string} message - The message content
 * @param {string} mentionBot - Optional bot to mention in the message
 * @returns {Promise<Object>} - Response from the relay server
 */
function sendMessage(fromBot, message, mentionBot = null) {
  return new Promise((resolve, reject) => {
    const fullMessage = mentionBot ? `@${mentionBot} ${message}` : message;
    
    log(`Sending message from ${fromBot}: "${fullMessage}"`);
    
    // The relay server requires agent_id, token, chat_id, and text as top-level properties
    const data = JSON.stringify({
      agent_id: fromBot,
      token: RELAY_AUTH_TOKEN,
      chat_id: GROUP_ID,
      text: fullMessage
    });
    
    log(`Payload: ${data}`);
    
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/sendMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    log(`Making HTTP request to ${options.hostname}:${options.port}${options.path}`);
    
    const req = http.request(options, (res) => {
      log(`Response status code: ${res.statusCode}`);
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log(`Message sent successfully. Response: ${responseData}`);
          try {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (e) {
            log(`Response was not JSON: ${responseData}`);
            resolve(responseData);
          }
        } else {
          const errorMsg = `Request failed with status code ${res.statusCode}: ${responseData}`;
          log(errorMsg);
          reject(new Error(errorMsg));
        }
      });
    });
    
    req.on('error', (e) => {
      const errorMsg = `HTTP request error: ${e.message}`;
      log(errorMsg);
      reject(new Error(errorMsg));
    });
    
    log('Sending HTTP request...');
    req.write(data);
    req.end();
    log('HTTP request sent');
  });
}

/**
 * Wait for a specified time
 * @param {number} ms - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
function wait(ms) {
  log(`Waiting for ${ms}ms...`);
  return new Promise(resolve => setTimeout(() => {
    log(`Wait of ${ms}ms completed`);
    resolve();
  }, ms));
}

/**
 * Run a conversation test between bots
 */
async function runConversationTest() {
  try {
    log('Starting bot conversation test');
    // Get server status first
    await checkServerStatus();
    
    // Conversation 1: Linda asks VCShark about sustainable fashion investments
    log('Starting conversation 1: Linda asks VCShark about sustainable fashion');
    await sendMessage(
      BOT_NAMES.LINDA, 
      "I've been thinking about sustainable fashion investments. What do you think about investing in companies that use recycled materials?", 
      BOT_NAMES.VCSHARK
    );
    
    log('Waiting for VCShark to respond...');
    await wait(15000);  // Wait 15 seconds
    
    // Check if VCShark responded by checking its logs
    log('Checking if VCShark responded by checking logs...');
    await checkAgentLogs('vc_shark_99');
    
    // Conversation 2: BitcoinMaxi asks EthMemeLord about crypto trends
    log('Starting conversation 2: BitcoinMaxi asks EthMemeLord about crypto trends');
    await sendMessage(
      BOT_NAMES.BITCOIN_MAXI,
      "Have you seen what's happening with layer 2 solutions lately? The throughput is insane!",
      BOT_NAMES.ETH_MEMELORD
    );
    
    log('Waiting for EthMemeLord to respond...');
    await wait(15000);  // Wait 15 seconds
    
    // Check if EthMemeLord responded by checking its logs
    log('Checking if EthMemeLord responded by checking logs...');
    await checkAgentLogs('eth_memelord_9000');
    
    log('Test complete! Check the logs to see if the bots responded properly.');
  } catch (error) {
    log(`Conversation test failed: ${error.message}`);
    if (error.stack) {
      log(`Error stack: ${error.stack}`);
    }
  }
}

/**
 * Check relay server status
 */
function checkServerStatus() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/health',
      method: 'GET'
    };
    
    log('Checking relay server status...');
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          log(`Server status: ${responseData}`);
          resolve(responseData);
        } else {
          const errorMsg = `Server status check failed: ${res.statusCode}`;
          log(errorMsg);
          reject(new Error(errorMsg));
        }
      });
    });
    
    req.on('error', (e) => {
      const errorMsg = `Server status check error: ${e.message}`;
      log(errorMsg);
      reject(new Error(errorMsg));
    });
    
    req.end();
  });
}

/**
 * Check agent logs for responses
 */
function checkAgentLogs(agentId) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    
    log(`Executing: tail -n 20 /root/eliza/logs/${agentId}.log`);
    
    exec(`tail -n 20 /root/eliza/logs/${agentId}.log`, (error, stdout, stderr) => {
      if (error) {
        log(`Error checking logs: ${error.message}`);
        reject(error);
        return;
      }
      
      if (stderr) {
        log(`Error output: ${stderr}`);
      }
      
      log(`Log output for ${agentId}:`);
      console.log(stdout);
      resolve(stdout);
    });
  });
}

// Run the test
log('Script started');
runConversationTest(); 