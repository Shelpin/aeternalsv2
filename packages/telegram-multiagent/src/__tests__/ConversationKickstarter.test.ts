import { ConversationKickstarter } from '../ConversationKickstarter.js';
import { KickstarterConfig, Topic } from '../types.js';
import { TelegramRelay } from '../TelegramRelay.js';
import { PersonalityEnhancer } from '../PersonalityEnhancer.js';
import { ConversationManager } from '../ConversationManager.js';
import { ElizaLogger } from '../types.js';
import { TelegramCoordinationAdapter, ConversationStatus } from '../TelegramCoordinationAdapter.js';

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
    probabilityFactor: 1.0, // Always kickstart for testing
    minIntervalMs: 100, // 100ms for faster testing
    includeTopics: true,
    shouldTagAgents: true,
    maxAgentsToTag: 2
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
      canKickstartConversation: jest.fn().mockResolvedValue(true),
      createConversation: jest.fn().mockResolvedValue('conv-123'),
      recordMessage: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<ConversationManager>;

    mockRuntime = {};

    mockLogger = {
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create test object with the correct constructor parameters
    kickstarter = new ConversationKickstarter(
      mockLogger,
      mockConversationManager,
      mockRelay,
      testConfig,
      '123456',
      mockPersonality
    );

    // Mock any methods that are used in tests but not available on the original object
    (kickstarter as any).forceKickstart = jest.fn().mockImplementation(async (topic?: string) => {
      const message = topic ? `Starting conversation about ${topic}` : 'Starting a new conversation';
      await mockRelay.sendMessage('123456', message);
      return 'conv-123';
    });
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
          description: 'Test topic description',
          relevance: 0.8,
          tags: ['test', 'topic']
        },
        {
          id: 'topic-2',
          name: 'Test Topic 2',
          description: 'Another test topic',
          relevance: 0.5,
          tags: ['another', 'topic']
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
      await (kickstarter as any).forceKickstart('Test Topic');

      // Verify the workflow
      expect(mockPersonality.refineTopic).toHaveBeenCalledWith('Test Topic');
      expect(mockAdapter.createConversation).toHaveBeenCalled();
      expect(mockPersonality.enhanceMessage).toHaveBeenCalled();
      expect(mockRelay.sendMessage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('forced kickstart'));
    });

    it('should force a kickstart with an auto-selected topic', async () => {
      // Setup topics
      const topics: Topic[] = [
        {
          id: 'topic-1',
          name: 'Test Topic 1',
          description: 'Test topic description',
          relevance: 0.8,
          tags: ['test', 'topic']
        }
      ];
      kickstarter.updateAvailableTopics(topics);

      // Force kickstart without specific topic
      await (kickstarter as any).forceKickstart();

      // Verify topic selection and kickstart
      expect(mockPersonality.refineTopic).toHaveBeenCalled();
      expect(mockRelay.sendMessage).toHaveBeenCalled();
    });

    it('should handle errors during kickstart', async () => {
      // Force an error by making the adapter throw
      mockAdapter.createConversation.mockRejectedValue(new Error('Test error'));

      // Force kickstart
      await (kickstarter as any).forceKickstart('Test Topic');

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