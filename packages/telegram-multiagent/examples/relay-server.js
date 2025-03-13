/**
 * Simple Telegram Relay Server for testing the ElizaOS Multi-Agent System
 * 
 * This is a minimal implementation for development and testing purposes.
 * For production use, a more robust implementation is recommended.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Create Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// In-memory storage
const connectedAgents = new Map(); // Map of agent_id -> { token, lastSeen }
const messageQueue = new Map();    // Map of agent_id -> Array of messages
let updateId = 1;                  // Incremental update ID

// Register an agent with the relay server
app.post('/register', (req, res) => {
  const { agent_id, token } = req.body;
  
  if (!agent_id || !token) {
    return res.json({ success: false, error: 'Missing agent_id or token' });
  }
  
  // Register the agent
  connectedAgents.set(agent_id, { 
    token, 
    lastSeen: Date.now(),
    updateOffset: 0
  });
  
  // Initialize message queue for this agent
  if (!messageQueue.has(agent_id)) {
    messageQueue.set(agent_id, []);
  }
  
  console.log(`Agent registered: ${agent_id}`);
  
  // Return currently connected agents
  const connectedAgentIds = Array.from(connectedAgents.keys());
  
  // Notify other agents about the new agent
  for (const [id, messages] of messageQueue.entries()) {
    if (id !== agent_id) {
      messages.push({
        update_id: updateId++,
        agent_updates: [{ agent_id, status: 'connected' }]
      });
    }
  }
  
  return res.json({ 
    success: true, 
    connected_agents: connectedAgentIds 
  });
});

// Unregister an agent
app.post('/unregister', (req, res) => {
  const { agent_id, token } = req.body;
  
  if (!agent_id || !token) {
    return res.json({ success: false, error: 'Missing agent_id or token' });
  }
  
  // Check if agent exists and token is valid
  const agent = connectedAgents.get(agent_id);
  if (!agent || agent.token !== token) {
    return res.json({ success: false, error: 'Invalid agent_id or token' });
  }
  
  // Remove the agent
  connectedAgents.delete(agent_id);
  messageQueue.delete(agent_id);
  
  console.log(`Agent unregistered: ${agent_id}`);
  
  // Notify other agents about the agent leaving
  for (const messages of messageQueue.values()) {
    messages.push({
      update_id: updateId++,
      agent_updates: [{ agent_id, status: 'disconnected' }]
    });
  }
  
  return res.json({ success: true });
});

// Send a heartbeat to keep the connection alive
app.post('/heartbeat', (req, res) => {
  const { agent_id, token } = req.body;
  
  if (!agent_id || !token) {
    return res.json({ success: false, error: 'Missing agent_id or token' });
  }
  
  // Check if agent exists and token is valid
  const agent = connectedAgents.get(agent_id);
  if (!agent || agent.token !== token) {
    return res.json({ success: false, error: 'Invalid agent_id or token' });
  }
  
  // Update last seen timestamp
  agent.lastSeen = Date.now();
  
  return res.json({ success: true });
});

// Get updates for an agent
app.get('/getUpdates', (req, res) => {
  const { agent_id, token, offset } = req.query;
  
  if (!agent_id || !token) {
    return res.json({ success: false, error: 'Missing agent_id or token' });
  }
  
  // Check if agent exists and token is valid
  const agent = connectedAgents.get(agent_id);
  if (!agent || agent.token !== token) {
    return res.json({ success: false, error: 'Invalid agent_id or token' });
  }
  
  // Update last seen timestamp
  agent.lastSeen = Date.now();
  
  // Get messages for this agent
  const messages = messageQueue.get(agent_id) || [];
  const offsetNum = parseInt(offset || '0', 10);
  
  // Filter messages by offset
  const newMessages = messages.filter(msg => msg.update_id >= offsetNum);
  
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
  const { agent_id, token, chat_id, text } = req.body;
  
  if (!agent_id || !token || !chat_id || !text) {
    return res.json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  // Check if agent exists and token is valid
  const agent = connectedAgents.get(agent_id);
  if (!agent || agent.token !== token) {
    return res.json({ success: false, error: 'Invalid agent_id or token' });
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
  
  console.log(`Message from ${agent_id}: ${text}`);
  
  // Add message to all other agents' queues
  for (const [id, messages] of messageQueue.entries()) {
    if (id !== agent_id) {
      messages.push(message);
    }
  }
  
  return res.json({ 
    success: true, 
    message_id: message.message.message_id 
  });
});

// Send a chat action (typing, etc.)
app.post('/sendChatAction', (req, res) => {
  const { agent_id, token, chat_id, action } = req.body;
  
  if (!agent_id || !token || !chat_id || !action) {
    return res.json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  // Check if agent exists and token is valid
  const agent = connectedAgents.get(agent_id);
  if (!agent || agent.token !== token) {
    return res.json({ success: false, error: 'Invalid agent_id or token' });
  }
  
  console.log(`Chat action from ${agent_id}: ${action}`);
  
  // In a real implementation, this would forward the action to Telegram
  // For this simple relay, we just acknowledge it
  
  return res.json({ success: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  return res.json({ 
    status: 'ok', 
    agents: connectedAgents.size,
    uptime: process.uptime()
  });
});

// Clean up inactive agents periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [id, agent] of connectedAgents.entries()) {
    if (now - agent.lastSeen > timeout) {
      console.log(`Agent timed out: ${id}`);
      connectedAgents.delete(id);
      messageQueue.delete(id);
      
      // Notify other agents
      for (const messages of messageQueue.values()) {
        messages.push({
          update_id: updateId++,
          agent_updates: [{ agent_id: id, status: 'disconnected' }]
        });
      }
    }
  }
}, 60 * 1000); // Check every minute

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Telegram Relay Server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /register - Register an agent');
  console.log('  POST /unregister - Unregister an agent');
  console.log('  POST /heartbeat - Send a heartbeat');
  console.log('  GET /getUpdates - Get updates for an agent');
  console.log('  POST /sendMessage - Send a message');
  console.log('  POST /sendChatAction - Send a chat action');
  console.log('  GET /health - Health check');
}); 