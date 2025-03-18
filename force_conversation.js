#!/usr/bin/env node
// Script to force a conversation between agents

const http = require('http');

const RELAY_SERVER_URL = 'http://localhost:4000';
const GROUP_ID = -1002550618173; // The group ID being used by agents
const SENDER_AGENT = 'vc_shark_99'; // Agent sending the message
const MENTIONED_AGENT = 'linda_evangelista_88'; // Agent being mentioned

function sendTestMessage() {
  try {
    // Required parameters for the sendMessage endpoint
    const messageData = {
      agent_id: SENDER_AGENT,
      token: 'elizaos-secure-relay-key', // Default auth token from code review
      chat_id: GROUP_ID,
      text: `Hey @${MENTIONED_AGENT}, what do you think about the current state of crypto markets? I've been looking at some potential investments.`
    };

    console.log(`Sending test message from ${SENDER_AGENT} mentioning ${MENTIONED_AGENT}...`);
    
    // Prepare the request data
    const postData = JSON.stringify(messageData);
    
    // Request options
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/sendMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    // Send the request
    const req = http.request(options, (res) => {
      console.log('Status Code:', res.statusCode);
      
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('Response data:', responseData);
        
        if (res.statusCode === 200) {
          const response = JSON.parse(responseData);
          if (response.success) {
            console.log('Message sent successfully!');
            console.log('This should trigger a response from', MENTIONED_AGENT);
            console.log('\nCheck the agent logs for activity using:');
            console.log('  bash monitor_agents.sh -w | grep -E "incoming|shouldRespond|decision"');
          } else {
            console.error('Error from server:', response.error);
          }
        } else {
          console.error('Failed to send message. Status code:', res.statusCode);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Error sending message:', error.message);
    });
    
    // Write data to request body
    req.write(postData);
    req.end();
    
  } catch (error) {
    console.error('Error in script:', error.message);
  }
}

// Run the function
sendTestMessage(); 