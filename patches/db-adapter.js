// Database Adapter Patch
// This patch provides an in-memory database implementation for testing

console.log('💾 Applying database adapter patch');

class InMemoryDatabase {
    constructor() {
        this.conversations = new Map();
        this.settings = new Map();
        console.log('💾 In-memory database initialized');
    }

    async createTables() {
        console.log('💾 Tables created in in-memory database');
        return true;
    }

    async saveConversation(userId, messages) {
        this.conversations.set(userId, messages);
        console.log(`💾 Saved conversation for user ${userId} with ${messages.length} messages`);
        return true;
    }

    async getConversation(userId) {
        const conversation = this.conversations.get(userId) || [];
        console.log(`💾 Retrieved conversation for user ${userId} with ${conversation.length} messages`);
        return conversation;
    }

    async clearConversation(userId) {
        this.conversations.delete(userId);
        console.log(`💾 Cleared conversation for user ${userId}`);
        return true;
    }

    async saveSetting(key, value) {
        this.settings.set(key, value);
        console.log(`💾 Saved setting: ${key} = ${JSON.stringify(value)}`);
        return true;
    }

    async getSetting(key) {
        const value = this.settings.get(key);
        console.log(`💾 Retrieved setting: ${key} = ${JSON.stringify(value)}`);
        return value;
    }

    async close() {
        console.log('💾 Closed in-memory database connection');
        return true;
    }
}

module.exports = {
    Database: InMemoryDatabase
};

console.log('💾 Database adapter patch applied successfully'); 