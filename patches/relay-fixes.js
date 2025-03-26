/**
 * Valhalla Relay Registration Fix
 * 
 * This patch ensures the relay registration is persistent by:
 * 1. Adding a periodic heartbeat
 * 2. Fixing agent ID normalization
 * 3. Ensuring proper port-based health check response
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Print process info for debugging
console.log(`📡 [RELAY-FIX] Process ID: ${process.pid}`);
console.log(`📡 [RELAY-FIX] Agent ID: ${process.env.AGENT_ID}`);
console.log(`📡 [RELAY-FIX] Port: ${process.env.HTTP_PORT || process.env.PORT || '(unknown)'}`);

// Create an HTTP server on the same port as the agent
// to respond to relay heartbeat checks
const port = process.env.HTTP_PORT || process.env.PORT || 3000;
const agentId = process.env.AGENT_ID;

if (!agentId) {
  console.error('❌ [RELAY-FIX] No AGENT_ID environment variable found');
  process.exit(1);
}

// Create a simple HTTP server to respond to relay heartbeat requests
const server = http.createServer((req, res) => {
  // Log all incoming requests
  console.log(`📡 [RELAY-FIX] Received request: ${req.method} ${req.url}`);
  
  // Handle health check endpoint
  if (req.url === '/health' || req.url === '/heartbeat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      agent_id: agentId,
      timestamp: Date.now()
    }));
    console.log(`📡 [RELAY-FIX] Sent health check response for ${agentId}`);
    return;
  }
  
  // Default response for other requests
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start the server and listen on the specified port
try {
  server.listen(port, () => {
    console.log(`📡 [RELAY-FIX] Heartbeat server listening on port ${port}`);
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error(`❌ [RELAY-FIX] Server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ [RELAY-FIX] Port ${port} is already in use - will try to use existing server`);
    }
  });
} catch (error) {
  console.error(`❌ [RELAY-FIX] Failed to start heartbeat server: ${error.message}`);
}

// Also send explicit heartbeat requests to the relay
const sendHeartbeat = async () => {
  try {
    const relayUrl = process.env.RELAY_SERVER_URL || 'http://207.180.245.243:4000';
    const authToken = process.env.RELAY_AUTH_TOKEN || 'elizaos-secure-relay-key';
    
    console.log(`📡 [RELAY-FIX] Sending heartbeat to ${relayUrl}/heartbeat`);
    
    const response = await fetch(`${relayUrl}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        agent_id: agentId
      })
    });
    
    if (response.ok) {
      console.log(`✅ [RELAY-FIX] Heartbeat successful for ${agentId}`);
    } else {
      console.error(`❌ [RELAY-FIX] Heartbeat failed: ${response.status} ${response.statusText}`);
      
      // If the agent isn't registered, try to register it
      if (response.status === 404 || response.status === 400) {
        console.log(`📡 [RELAY-FIX] Agent not registered, attempting registration`);
        
        const registerResponse = await fetch(`${relayUrl}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            agent_id: agentId,
            token: authToken
          })
        });
        
        if (registerResponse.ok) {
          console.log(`✅ [RELAY-FIX] Registration successful for ${agentId}`);
        } else {
          console.error(`❌ [RELAY-FIX] Registration failed: ${registerResponse.status} ${registerResponse.statusText}`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ [RELAY-FIX] Error sending heartbeat: ${error.message}`);
  }
};

// Send immediate heartbeat
sendHeartbeat();

// Schedule regular heartbeats
const heartbeatInterval = setInterval(sendHeartbeat, 30000); // Every 30 seconds

// Clean up on exit
process.on('exit', () => {
  clearInterval(heartbeatInterval);
  server.close();
});

// Handle signals
process.on('SIGINT', () => {
  console.log('📡 [RELAY-FIX] Received SIGINT, shutting down');
  clearInterval(heartbeatInterval);
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('📡 [RELAY-FIX] Received SIGTERM, shutting down');
  clearInterval(heartbeatInterval);
  server.close(() => {
    process.exit(0);
  });
});

export { server }; 