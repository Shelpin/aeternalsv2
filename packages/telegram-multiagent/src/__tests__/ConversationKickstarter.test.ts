import { ConversationKickstarter, KickstarterConfig } from '../ConversationKickstarter';
import { TelegramCoordinationAdapter, ConversationStatus, Topic } from '../TelegramCoordinationAdapter';
import { TelegramRelay } from '../TelegramRelay';
import { PersonalityEnhancer } from '../PersonalityEnhancer';
import { ConversationManager } from '../ConversationManager';
import { ElizaLogger } from '../types';

// Mock dependencies
jest.mock('../TelegramCoordinationAdapter');
jest.mock('../TelegramRelay');
jest.mock('../PersonalityEnhancer');
jest.mock('../ConversationManager');

describe('ConversationKickstarter', () => {
  // Mock objects
  let mockAdapter: jest.Mocked<TelegramCoordinationAdapter>;
  let mockRelay: jest.Mocked<TelegramRelay>;
  let mockPersonality: jest.Mocked<PersonalityEnhancer>;
  let mockConversationManager: jest.Mocked<ConversationManager>;
  let mockRuntime: any;
  let mockLogger: ElizaLogger;
  
  // Test object
  let kickstarter: ConversationKickstarter;
  
  // Test configuration
  const testConfig: KickstarterConfig = {
    minInterval: 100, // 100ms for faster testing
    maxInterval: 200, // 200ms for faster testing
    probabilityFactor: 1.0, // Always kickstart for testing
    maxActiveConversationsPerGroup: 2,
    shouldTagAgents: true,
    maxAgentsToTag: 2,
    persistConversations: true
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock objects
    mockAdapter = {
      getActiveConversations: jest.fn().mockResolvedValue([]),
      createConversation: jest.fn().mockImplementation(async (conv) => conv.id),
      recordMessage: jest.fn().mockResolvedValue(undefined),
      addParticipant: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<TelegramCoordinationAdapter>;
    
    mockRelay = {
      sendMessage: jest.fn().mockReturnValue('msg_id')
    } as unknown as jest.Mocked<TelegramRelay>;
    
    mockPersonality = {
      refineTopic: jest.fn().mockImplementation((topic) => `Refined: ${topic}`),
      enhanceMessage: jest.fn().mockImplementation((msg) => `Enhanced: ${msg}`),
      generateTopic: jest.fn().mockReturnValue('Generated Topic')
    } as unknown as jest.Mocked<PersonalityEnhancer>;
    
    mockConversationManager = {
      initiateConversation: jest.fn().mockReturnValue('conv-123')
    } as unknown as jest.Mocked<ConversationManager>;
    
    mockRuntime = {};
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Create test object
    kickstarter = new ConversationKickstarter(
      mockAdapter,
      mockRelay,
      mockPersonality,
      mockConversationManager,
      'agent-1',
      '123456',
      mockRuntime,
      mockLogger,
      testConfig
    );
  });
  
  describe('start() and stop()', () => {
    it('should start and stop the kickstarter service', () => {
      // Start the service
      kickstarter.start();
      expect(mockLogger.info).toHaveBeenCalledWith('ConversationKickstarter: Started');
      
      // Stop the service
      kickstarter.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('ConversationKickstarter: Stopped');
    });
    
    it('should not start if already active', () => {
      kickstarter.start();
      jest.clearAllMocks();
      
      kickstarter.start();
      expect(mockLogger.warn).toHaveBeenCalledWith('ConversationKickstarter: Already active');
    });
  });
  
  describe('updateAvailableTopics() and updateKnownAgents()', () => {
    it('should update available topics', () => {
      const topics: Topic[] = [
        {
          id: 'topic-1',
          name: 'Test Topic 1',
          keywords: ['test', 'topic'],
          lastDiscussed: Date.now() - 3600000,
          agentInterest: { 'agent-1': 0.8 }
        },
        {
          id: 'topic-2',
          name: 'Test Topic 2',
          keywords: ['another', 'topic'],
          lastDiscussed: Date.now() - 7200000,
          agentInterest: { 'agent-1': 0.5 }
        }
      ];
      
      kickstarter.updateAvailableTopics(topics);
      expect(mockLogger.debug).toHaveBeenCalledWith('ConversationKickstarter: Updated available topics (2)');
    });
    
    it('should update known agents', () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      
      kickstarter.updateKnownAgents(agents);
      expect(mockLogger.debug).toHaveBeenCalledWith('ConversationKickstarter: Updated known agents (3)');
    });
  });
  
  describe('forceKickstart()', () => {
    it('should force a kickstart with a provided topic', async () => {
      // Setup agents to tag
      kickstarter.updateKnownAgents(['agent-1', 'agent-2', 'agent-3']);
      
      // Force kickstart with specific topic
      await kickstarter.forceKickstart('Test Topic');
      
      // Verify the workflow
      expect(mockPersonality.refineTopic).toHaveBeenCalledWith('Test Topic');
      expect(mockAdapter.createConversation).toHaveBeenCalled();
      expect(mockPersonality.enhanceMessage).toHaveBeenCalled();
      expect(mockRelay.sendMessage).toHaveBeenCalled();
      expect(mockConversationManager.initiateConversation).toHaveBeenCalled();
      expect(mockAdapter.recordMessage).toHaveBeenCalled();
      expect(mockAdapter.addParticipant).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Forced kickstart'));
    });
    
    it('should force a kickstart with an auto-selected topic', async () => {
      // Setup topics
      const topics: Topic[] = [
        {
          id: 'topic-1',
          name: 'Test Topic 1',
          keywords: ['test', 'topic'],
          lastDiscussed: Date.now() - 3600000,
          agentInterest: { 'agent-1': 0.8 }
        }
      ];
      kickstarter.updateAvailableTopics(topics);
      
      // Force kickstart without specific topic
      await kickstarter.forceKickstart();
      
      // Verify topic selection and kickstart
      expect(mockPersonality.refineTopic).toHaveBeenCalled();
      expect(mockAdapter.createConversation).toHaveBeenCalled();
      expect(mockRelay.sendMessage).toHaveBeenCalled();
    });
    
    it('should handle errors during kickstart', async () => {
      // Force an error by making the adapter throw
      mockAdapter.createConversation.mockRejectedValue(new Error('Test error'));
      
      // Force kickstart
      await kickstarter.forceKickstart('Test Topic');
      
      // Verify error handling
      expect(mockLogger.error).toHaveBeenCalledWith(
        'ConversationKickstarter: Error during forced kickstart',
        expect.any(Error)
      );
    });
  });
  
  describe('attemptKickstart()', () => {
    it('should skip kickstart if max active conversations reached', async () => {
      // Setup mock to return max active conversations
      mockAdapter.getActiveConversations.mockResolvedValue([
        { id: 'conv-1' } as any,
        { id: 'conv-2' } as any
      ]);
      
      // Access private method for testing
      await (kickstarter as any).attemptKickstart();
      
      // Verify skip behavior
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ConversationKickstarter: Skipping kickstart (max active conversations reached)'
      );
      expect(mockAdapter.createConversation).not.toHaveBeenCalled();
    });
    
    it('should handle errors during attemptKickstart', async () => {
      // Force an error in getActiveConversations
      mockAdapter.getActiveConversations.mockRejectedValue(new Error('Test error'));
      
      // Access private method for testing
      await (kickstarter as any).attemptKickstart();
      
      // Verify error handling
      expect(mockLogger.error).toHaveBeenCalledWith(
        'ConversationKickstarter: Error during kickstart attempt',
        expect.any(Error)
      );
    });
  });
}); 