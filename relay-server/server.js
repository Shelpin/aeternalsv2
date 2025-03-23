/**
 * Simple Telegram Relay Server for testing the ElizaOS Multi-Agent System
 * 
 * This is a minimal implementation for development and testing purposes.
 * For production use, a more robust implementation is recommended.
 */

require('dotenv').config({ path: '../.env' });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Create Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Load API key from environment variable
const RELAY_API_KEY = process.env.RELAY_API_KEY || 'elizaos-secure-relay-key';
logWithTime(`🔑 Using relay API key: ${RELAY_API_KEY.substring(0, 5)}****`);

// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  // Check header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    if (token === RELAY_API_KEY) {
      return next(); // Valid token in header
    }
  }
  
  // Then check body token as fallback
  if (req.body && req.body.token === RELAY_API_KEY) {
    return next(); // Valid token in body
  }
  
  // Skip auth for health endpoint
  if (req.path === '/health') {
    return next();
  }
  
  // Log auth failure
  logWithTime(`❌ Authentication failed for ${req.path}`);
  logWithTime(`🔍 Auth header: ${req.headers.authorization || 'None'}`);
  if (req.body && req.body.token) {
    logWithTime(`🔍 Auth body token: ${req.body.token.substring(0, 5)}****`);
  }
  
  return res.status(401).json({ 
    success: false, 
    error: 'Unauthorized - Invalid API key' 
  });
};

// Apply auth middleware to all routes except health
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  authenticateApiKey(req, res, next);
});

// Logging function with timestamps
function logWithTime(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// In-memory storage
const connectedAgents = new Map(); // Map of agent_id -> { token, lastSeen }
const messageQueue = new Map();    // Map of agent_id -> Array of messages
let updateId = 1;                  // Incremental update ID

// Register an agent with the relay server
app.post('/register', (req, res) => {
  logWithTime(`🔍 Registration attempt received - Full request body: ${JSON.stringify(req.body)}`);
  logWithTime(`🔍 Authorization header: ${req.headers.authorization || 'None'}`);
  logWithTime(`🔍 Expected key: ${RELAY_API_KEY.substring(0, 5)}****`);
  
  // Enhanced debugging for auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    logWithTime(`🔍 Bearer token: ${token.substring(0, 5)}****`);
    logWithTime(`🔍 Token match: ${token === RELAY_API_KEY}`);
  } else {
    logWithTime(`⚠️ No Bearer token in authorization header`);
  }
  
  if (req.body && req.body.token) {
    logWithTime(`🔍 Body token: ${req.body.token.substring(0, 5)}****`);
    logWithTime(`🔍 Body token match: ${req.body.token === RELAY_API_KEY}`);
  } else {
    logWithTime(`⚠️ No token in request body`);
  }
  
  const { agent_id } = req.body;
  
  if (!agent_id) {
    logWithTime(`❌ Registration failed: Missing agent_id`);
    return res.json({ success: false, error: 'Missing agent_id' });
  }
  
  // Register the agent
  connectedAgents.set(agent_id, { 
    token: 'via-auth-header', // Token is now validated via middleware
    lastSeen: Date.now(),
    updateOffset: 0
  });
  
  // Initialize message queue for this agent
  if (!messageQueue.has(agent_id)) {
    messageQueue.set(agent_id, []);
  }
  
  logWithTime(`✅ Agent registered: ${agent_id}`);
  logWithTime(`ℹ️ Total connected agents: ${connectedAgents.size}`);
  
  // Return currently connected agents
  const connectedAgentIds = Array.from(connectedAgents.keys());
  logWithTime(`🔄 Connected agents: ${connectedAgentIds.join(', ')}`);
  
  // Notify other agents about the new agent
  for (const [id, messages] of messageQueue.entries()) {
    if (id !== agent_id) {
      messages.push({
        update_id: updateId++,
        agent_updates: [{ agent_id, status: 'connected' }]
      });
      logWithTime(`📣 Notified ${id} about ${agent_id} connecting`);
    }
  }
  
  return res.json({ 
    success: true, 
    connected_agents: connectedAgentIds 
  });
});

// Unregister an agent
app.post('/unregister', (req, res) => {
  const { agent_id } = req.body;
  
  if (!agent_id) {
    logWithTime(`❌ Unregister failed: Missing agent_id`);
    return res.json({ success: false, error: 'Missing agent_id' });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`❌ Unregister failed: Agent not registered: ${agent_id}`);
    return res.json({ success: false, error: 'Agent not registered' });
  }
  
  // Remove the agent
  connectedAgents.delete(agent_id);
  messageQueue.delete(agent_id);
  
  logWithTime(`👋 Agent unregistered: ${agent_id}`);
  logWithTime(`ℹ️ Total connected agents: ${connectedAgents.size}`);
  
  // Notify other agents about the agent leaving
  for (const messages of messageQueue.values()) {
    messages.push({
      update_id: updateId++,
      agent_updates: [{ agent_id, status: 'disconnected' }]
    });
  }
  logWithTime(`📣 Notified all agents about ${agent_id} disconnecting`);
  
  return res.json({ success: true });
});

// Send a heartbeat to keep the connection alive
app.post('/heartbeat', (req, res) => {
  const { agent_id } = req.body;
  
  if (!agent_id) {
    logWithTime(`❌ Heartbeat failed: Missing agent_id`);
    return res.json({ success: false, error: 'Missing agent_id' });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`❌ Heartbeat failed: Agent not registered: ${agent_id}`);
    return res.json({ success: false, error: 'Agent not registered' });
  }
  
  // Update last seen time
  agent.lastSeen = Date.now();
  
  return res.json({ success: true });
});

// Get updates for an agent
app.get('/getUpdates', (req, res) => {
  const { agent_id, offset } = req.query;
  
  if (!agent_id) {
    logWithTime(`❌ GetUpdates failed: Missing agent_id`);
    return res.json({ success: false, error: 'Missing agent_id' });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`❌ GetUpdates failed: Agent not registered: ${agent_id}`);
    return res.json({ success: false, error: 'Agent not registered' });
  }
  
  // Update last seen timestamp
  agent.lastSeen = Date.now();
  
  // Get messages for this agent
  const messages = messageQueue.get(agent_id) || [];
  const offsetNum = parseInt(offset || '0', 10);
  
  // Filter messages by offset
  const newMessages = messages.filter(msg => msg.update_id >= offsetNum);
  
  if (newMessages.length > 0) {
    logWithTime(`📨 Sending ${newMessages.length} updates to ${agent_id}`);
  } else {
    logWithTime(`🔄 No new updates for ${agent_id}`);
  }
  
  // Clear processed messages
  if (newMessages.length > 0) {
    const maxUpdateId = Math.max(...newMessages.map(msg => msg.update_id));
    const remainingMessages = messages.filter(msg => msg.update_id > maxUpdateId);
    messageQueue.set(agent_id, remainingMessages);
  }
  
  return res.json({ 
    success: true, 
    messages: newMessages
  });
});

// Send a message
app.post('/sendMessage', (req, res) => {
  const { agent_id, chat_id, text } = req.body;
  
  if (!agent_id || !chat_id || !text) {
    logWithTime(`❌ SendMessage failed: Missing required parameters`);
    return res.json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`❌ SendMessage failed: Agent not registered: ${agent_id}`);
    return res.json({ success: false, error: 'Agent not registered' });
  }
  
  // Create a message object
  const message = {
    update_id: updateId++,
    message: {
      message_id: Math.floor(Math.random() * 1000000),
      from: {
        id: parseInt(agent_id.replace(/\D/g, ''), 10) || 12345,
        is_bot: true,
        first_name: agent_id,
        username: agent_id
      },
      chat: {
        id: parseInt(chat_id, 10),
        type: 'group',
        title: 'Test Group'
      },
      date: Math.floor(Date.now() / 1000),
      text: text,
      sender_agent_id: agent_id
    }
  };
  
  logWithTime(`💬 Message from ${agent_id}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
  
  // Add message to all other agents' queues
  for (const [id, messages] of messageQueue.entries()) {
    if (id !== agent_id) {
      messages.push(message);
      logWithTime(`📤 Queued message for ${id} from ${agent_id}`);
    }
  }
  
  return res.json({ 
    success: true, 
    message_id: message.message.message_id 
  });
});

// Send a chat action (typing, etc.)
app.post('/sendChatAction', (req, res) => {
  const { agent_id, chat_id, action } = req.body;
  
  if (!agent_id || !chat_id || !action) {
    logWithTime(`❌ SendChatAction failed: Missing required parameters`);
    return res.json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`❌ SendChatAction failed: Agent not registered: ${agent_id}`);
    return res.json({ success: false, error: 'Agent not registered' });
  }
  
  logWithTime(`⌨️ Chat action from ${agent_id}: ${action}`);
  
  // In a real implementation, this would forward the action to Telegram
  // For this simple relay, we just acknowledge it
  
  return res.json({ success: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const agentsList = Array.from(connectedAgents.keys()).join(', ');
  logWithTime(`ℹ️ Health check - Agents online: ${connectedAgents.size}`);
  
  return res.json({ 
    status: 'ok', 
    agents: connectedAgents.size,
    agents_list: agentsList,
    uptime: process.uptime()
  });
});

// Clean up inactive agents periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  logWithTime(`🧹 Running cleanup check for inactive agents`);
  
  for (const [id, agent] of connectedAgents.entries()) {
    if (now - agent.lastSeen > timeout) {
      logWithTime(`⏰ Agent timed out: ${id} (inactive for ${Math.floor((now - agent.lastSeen) / 1000 / 60)} minutes)`);
      connectedAgents.delete(id);
      messageQueue.delete(id);
      
      // Notify other agents
      for (const messages of messageQueue.values()) {
        messages.push({
          update_id: updateId++,
          agent_updates: [{ agent_id: id, status: 'disconnected' }]
        });
      }
      logWithTime(`📣 Notified all agents about ${id} timing out`);
    }
  }
  
  logWithTime(`ℹ️ Current active agents: ${connectedAgents.size}`);
}, 60 * 1000); // Check every minute

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logWithTime(`🚀 Telegram Relay Server running on port ${PORT}`);
  logWithTime(`📝 Available endpoints:`);
  logWithTime(`  POST /register - Register an agent`);
  logWithTime(`  POST /unregister - Unregister an agent`);
  logWithTime(`  POST /heartbeat - Send a heartbeat`);
  logWithTime(`  GET /getUpdates - Get updates for an agent`);
  logWithTime(`  POST /sendMessage - Send a message`);
  logWithTime(`  POST /sendChatAction - Send a chat action`);
  logWithTime(`  GET /health - Health check`);
}); 