/**
 * In-Memory Storage untuk TmaChat
 * Temporary storage tanpa database
 * Data akan reset ketika server restart
 */

class MemoryStorage {
  constructor() {
    this.chats = new Map();
    this.messages = new Map();
    this.users = new Map();
    this.initializeSampleData();
  }

  /**
   * Initialize sample data untuk testing
   */
  initializeSampleData() {
    const sampleChats = [
      {
        id: '1',
        title: 'Sanduar Project AI Chat dengs...',
        userId: 'default-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timestamp: 'Today'
      },
      {
        id: '2',
        title: 'Dassin Uze Case Sistem Infor...',
        userId: 'default-user', 
        createdAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        timestamp: '2005-05'
      }
    ];

    const sampleMessages = [
      {
        id: '1',
        chatId: '1',
        content: 'Halo, apa yang bisa saya bantu?',
        role: 'assistant',
        timestamp: new Date().toISOString()
      },
      {
        id: '2', 
        chatId: '2',
        content: 'Saya butuh bantuan dengan sistem informasi',
        role: 'user',
        timestamp: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    sampleChats.forEach(chat => this.chats.set(chat.id, chat));
    sampleMessages.forEach(message => {
      if (!this.messages.has(message.chatId)) {
        this.messages.set(message.chatId, []);
      }
      this.messages.get(message.chatId).push(message);
    });
  }

  // Chat methods
  async getChatsByUser(userId) {
    return Array.from(this.chats.values())
      .filter(chat => chat.userId === userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getChatById(chatId) {
    const chat = this.chats.get(chatId);
    if (!chat) return null;

    const chatMessages = this.messages.get(chatId) || [];
    return {
      ...chat,
      messages: chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    };
  }

 /**
 * Enhanced createChat method dengan immediate data availability
 */

  async createChat(chatData) {
    const chatId = Date.now().toString();
    
    const chat = {
      id: chatId,
      title: chatData.title || 'New Chat',
      userId: chatData.userId || 'default-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timestamp: 'Now',
      messages: [] // ✅ FIXED: Ensure messages array exists
    };

    this.chats.set(chatId, chat);
    this.messages.set(chatId, []); // ✅ FIXED: Initialize empty messages array

    console.log('Created new chat:', { id: chatId, title: chat.title });
    
    return chat;
  }

  /**
 * Enhanced updateChat method dengan proper title handling
 */

  async updateChat(chatId, updates) {
    const chat = this.chats.get(chatId);
    if (!chat) return null;

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // ✅ FIXED: Update timestamp grouping jika title berubah
    if (updates.title && updates.title !== chat.title) {
      const now = new Date();
      const today = new Date().toDateString();
      const chatDate = new Date(chat.createdAt).toDateString();
      
      if (chatDate === today) {
        updatedChat.timestamp = 'Today';
      } else {
        // Format: "May 2005"
        updatedChat.timestamp = new Date(chat.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long'
        });
      }
    }

    this.chats.set(chatId, updatedChat);
    return updatedChat;
  }

  async deleteChat(chatId) {
    this.chats.delete(chatId);
    this.messages.delete(chatId);
    return true;
  }

  // Message methods
  async addMessage(chatId, messageData) {
    if (!this.messages.has(chatId)) {
      this.messages.set(chatId, []);
    }

    const message = {
      id: Date.now().toString(),
      chatId,
      content: messageData.content,
      role: messageData.role,
      timestamp: new Date().toISOString()
    };

    this.messages.get(chatId).push(message);

    // Update chat timestamp
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.updatedAt = new Date().toISOString();
      
      // Update chat title if it's the first user message
      if (messageData.role === 'user' && chat.title === 'New Chat') {
        chat.title = messageData.content.slice(0, 30) + (messageData.content.length > 30 ? '...' : '');
      }
    }

    return message;
  }

  async getMessagesByChat(chatId) {
    return this.messages.get(chatId) || [];
  }

  // Utility methods
  async clearUserData(userId) {
    const userChats = Array.from(this.chats.values()).filter(chat => chat.userId === userId);
    userChats.forEach(chat => {
      this.chats.delete(chat.id);
      this.messages.delete(chat.id);
    });
  }

  getStats() {
    return {
      totalChats: this.chats.size,
      totalMessages: Array.from(this.messages.values()).reduce((acc, msgs) => acc + msgs.length, 0),
      users: Array.from(new Set(Array.from(this.chats.values()).map(chat => chat.userId))).length
    };
  }
}

// Export singleton instance
export const memoryStorage = new MemoryStorage();
export default MemoryStorage;