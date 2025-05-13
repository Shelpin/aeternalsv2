import { ConversationManager } from '../ConversationManager.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock logger
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn()
};

// Create test data directory
const TEST_DATA_DIR = path.resolve(__dirname, '../../../test-data');
if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

// Set environment variable for test database path
process.env.DATABASE_PATH = path.join(TEST_DATA_DIR, 'test-multiagent.db');

describe('ConversationManager', () => {
    afterAll(() => {
        // Clean up test database file after tests
        try {
            if (fs.existsSync(process.env.DATABASE_PATH as string)) {
                fs.unlinkSync(process.env.DATABASE_PATH as string);
            }
        } catch (error) {
            console.error('Error cleaning up test database:', error);
        }
    });

    it('should initialize with a database connection', async () => {
        // Create conversation manager with mock runtime
        const convoManager = new ConversationManager('test-agent', null, mockLogger);

        // Initialize the manager
        await convoManager.initialize();

        // Verify initialization logs
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing with database path'));
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Connected to SQLite database'));

        // Clean up
        await convoManager.shutdown();
    });

    it('should save and retrieve conversation state', async () => {
        // Create conversation manager
        const convoManager = new ConversationManager('test-agent', null, mockLogger);

        // Initialize the manager
        await convoManager.initialize();

        // Test state data
        const groupId = 'test-group-123';
        const testState = {
            lastSpeaker: 'user123',
            lastUpdate: Date.now(),
            participants: { 'user123': { lastMessage: Date.now() } },
            topic: 'Test conversation'
        };

        // Save state
        await convoManager.saveState(groupId, testState);

        // Retrieve state
        const retrievedState = await convoManager.getState(groupId);

        // Verify state was saved and retrieved correctly
        expect(retrievedState).not.toBeNull();
        expect(retrievedState?.lastSpeaker).toBe(testState.lastSpeaker);
        expect(retrievedState?.topic).toBe(testState.topic);

        // Clean up
        await convoManager.shutdown();
    });
}); 