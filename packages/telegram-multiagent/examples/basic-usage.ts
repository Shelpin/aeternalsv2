import { Runtime } from '@elizaos/core';
import { 
  registerPlugin, 
  TelegramCoordinationAdapter, 
  TelegramRelay, 
  ConversationManager,
  PersonalityEnhancer,
  ConversationFlow,
  ConversationStatus
} from '../src';
import { v4 as uuidv4 } from 'uuid';

// Example configuration
const CONFIG = {
  relayServerUrl: 'http://localhost:3000',
  dbPath: './telegram_multiagent.sqlite',
  telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN',
  agentId: 'bitcoin_maxi_420',
  groupId: '-1001234567890'
};

/**
 * Main function to demonstrate the Telegram Multi-Agent system
 */
async function main() {
  try {
    console.log('Starting Telegram Multi-Agent example...');
    
    // Create ElizaOS runtime
    const runtime = new Runtime();
    
    // Register the plugin
    registerPlugin(runtime, {
      dbPath: CONFIG.dbPath,
      relayServerUrl: CONFIG.relayServerUrl
    });
    
    // Start the runtime
    await runtime.start();
    console.log('ElizaOS runtime started');
    
    // Get the coordination adapter from the runtime
    const adapter = runtime.getService('telegramCoordinationAdapter') as TelegramCoordinationAdapter;
    
    // Create a relay instance
    const relay = new TelegramRelay({
      relayServerUrl: CONFIG.relayServerUrl,
      agentId: CONFIG.agentId,
      token: CONFIG.telegramToken
    });
    
    // Start the relay
    await relay.start();
    console.log('Telegram relay started');
    
    // Create a personality enhancer
    const personality = new PersonalityEnhancer(CONFIG.agentId, runtime);
    
    // Create a conversation manager
    const manager = new ConversationManager({
      adapter,
      relay,
      personality,
      agentId: CONFIG.agentId,
      groupId: CONFIG.groupId
    });
    
    // Initialize the manager
    await manager.initialize();
    console.log('Conversation manager initialized');
    
    // Example: Create a conversation
    const conversationId = uuidv4();
    await adapter.createConversation({
      id: conversationId,
      groupId: CONFIG.groupId,
      status: ConversationStatus.ACTIVE,
      startedAt: Date.now(),
      initiatedBy: CONFIG.agentId,
      topic: 'Bitcoin price predictions',
      messageCount: 0
    });
    
    // Add the initiating agent as a participant
    await adapter.addParticipant(conversationId, {
      agentId: CONFIG.agentId,
      joinedAt: Date.now(),
      messageCount: 0,
      lastActive: Date.now()
    });
    
    console.log(`Created conversation: ${conversationId}`);
    
    // Create a conversation flow for enhanced messaging
    const flow = new ConversationFlow(
      relay,
      CONFIG.groupId,
      personality
    );
    
    // Send an enhanced message
    await flow.sendEnhancedMessage(
      'I believe Bitcoin will reach $100,000 by the end of the year. The fundamentals are stronger than ever!',
      { 
        topicOfInterest: 'bitcoin',
        opinion: 'bullish'
      }
    );
    
    console.log('Sent enhanced message');
    
    // Example: Invite another agent to the conversation
    const otherAgentId = 'eth_memelord_9000';
    if (relay.isAgentConnected(otherAgentId)) {
      await manager.inviteAgent(conversationId, otherAgentId);
      console.log(`Invited agent ${otherAgentId} to conversation`);
    }
    
    // Set up event listeners
    relay.on('message_received', async (message) => {
      console.log(`Received message: ${message.text}`);
      
      // Record the message in the database
      if (message.text) {
        await adapter.recordMessage({
          id: uuidv4(),
          conversationId,
          senderId: message.from.username || message.from.id.toString(),
          content: message.text,
          sentAt: message.date * 1000,
          isFollowUp: false
        });
      }
      
      // Check if we should end the conversation
      if (await manager.shouldEndConversation(conversationId)) {
        await manager.endConversation(conversationId);
        console.log('Ended conversation');
      }
    });
    
    console.log('Example setup complete. Press Ctrl+C to exit.');
  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run the example
main().catch(console.error); 