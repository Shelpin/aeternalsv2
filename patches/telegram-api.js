// Telegram API Patch
// This patch provides a mock implementation of the Telegram API for testing

console.log('📱 Applying Telegram API patch');

class TelegramApiMock {
    constructor() {
        console.log('📱 Telegram API mock initialized');
        this.messages = [];
        this.users = [
            { id: 1, first_name: 'Test', last_name: 'User', username: 'testuser' },
            { id: 2, first_name: 'Jane', last_name: 'Doe', username: 'janedoe' }
        ];
        this.mockUpdateId = 1000;
    }

    async sendMessage(chatId, text, options = {}) {
        console.log(`📱 Sending mock message to chat ${chatId}: "${text.substring(0, 30)}..."`);

        const message = {
            message_id: this.messages.length + 1,
            from: {
                id: 999999,
                is_bot: true,
                first_name: 'ELIZA',
                username: 'eliza_bot'
            },
            chat: {
                id: chatId,
                first_name: 'Test',
                last_name: 'User',
                username: 'testuser',
                type: 'private'
            },
            date: Math.floor(Date.now() / 1000),
            text: text
        };

        this.messages.push(message);

        return {
            ok: true,
            result: message
        };
    }

    async getUpdates(options = {}) {
        // Simulate no updates most of the time
        if (Math.random() > 0.3) {
            return { ok: true, result: [] };
        }

        // Occasionally simulate receiving a message
        const userId = this.users[Math.floor(Math.random() * this.users.length)].id;
        const randomTexts = [
            "Hello there!",
            "How are you?",
            "What can you do?",
            "Tell me a joke",
            "What's the weather like?",
            "Who created you?",
            "Goodbye"
        ];

        const text = randomTexts[Math.floor(Math.random() * randomTexts.length)];

        const update = {
            update_id: this.mockUpdateId++,
            message: {
                message_id: this.messages.length + 1,
                from: this.users.find(u => u.id === userId),
                chat: {
                    id: userId,
                    first_name: this.users.find(u => u.id === userId).first_name,
                    last_name: this.users.find(u => u.id === userId).last_name,
                    username: this.users.find(u => u.id === userId).username,
                    type: 'private'
                },
                date: Math.floor(Date.now() / 1000),
                text: text
            }
        };

        this.messages.push(update.message);

        console.log(`📱 Mock update received: "${text}" from user ${userId}`);

        return {
            ok: true,
            result: [update]
        };
    }
}

module.exports = {
    Telegram: TelegramApiMock
};

console.log('📱 Telegram API patch applied successfully'); 