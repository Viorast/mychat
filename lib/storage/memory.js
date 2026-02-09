class MemoryStorage {
  constructor() {
    this.chats = new Map();
    this.messages = new Map();
    this.groups = new Map();  // NEW: For chat grouping

    // Initialize default group
    this.groups.set('uncategorized', {
      id: 'uncategorized',
      name: 'Uncategorized',
      userId: 'all',
      color: '#6B7280',
      icon: '📁',
      order: 999,
      isCollapsed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // init() {
  //   if (this.chats.size === 0) {
  //       const sampleChat = {
  //         id: 'default-chat',
  //         title: 'Welcome Chat',
  //         userId: 'default-user',
  //         createdAt: new Date(),
  //         updatedAt: new Date(),
  //       };

  //       this.chats.set(sampleChat.id, sampleChat);
  //       this.messages.set(sampleChat.id, []);
  //   }
  // }

  // Chat methods
  async getChatsByUser(userId) {
    return Array.from(this.chats.values())
      .filter(chat => chat.userId === userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getChatById(chatId) {
    return this.chats.get(chatId) || null;
  }

  async createChat(chatData) {
    const chat = {
      id: `chat-${Date.now()}`,
      title: chatData.title,
      userId: chatData.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.chats.set(chat.id, chat);
    this.messages.set(chat.id, []);

    return chat;
  }

  async updateChat(chatId, updates) {
    const chat = this.chats.get(chatId);
    if (!chat) return null;

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date(),
    };

    this.chats.set(chatId, updatedChat);
    return updatedChat;
  }

  async deleteChat(chatId) {
    this.chats.delete(chatId);
    this.messages.delete(chatId);
    return true;
  }

  // Message methods
  async getMessagesByChat(chatId) {
    return this.messages.get(chatId) || [];
  }

  async addMessageToChat(chatId, message) {
    if (!this.messages.has(chatId)) {
      if (this.chats.has(chatId)) {
        this.messages.set(chatId, []);
      } else {
        console.warn(`[MemoryStorage] Menambahkan pesan ke chat ID ${chatId} yang tidak ada.`);
        return null;
      }
    }

    const messages = this.messages.get(chatId);

    const messageWithId = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: message.role || 'user',
      content: message.content || '',
      timestamp: message.timestamp || new Date(),
      ...message
    };

    messages.push(messageWithId);

    const chat = this.chats.get(chatId);
    if (chat) {
      chat.updatedAt = new Date();
    }

    return messageWithId;
  }

  async updateMessage(chatId, messageId, updates) {
    if (!this.messages.has(chatId)) {
      console.warn(`[MemoryStorage] updateMessage: Chat ID ${chatId} tidak ditemukan.`);
      return null;
    }

    const messages = this.messages.get(chatId);
    const messageIndex = messages.findIndex(msg => msg.id === messageId);

    if (messageIndex === -1) {
      console.warn(`[MemoryStorage] updateMessage: Message ID ${messageId} tidak ditemukan di chat ${chatId}.`);
      return null;
    }

    // Gabungkan (merge) update ke pesan yang ada
    const updatedMessage = {
      ...messages[messageIndex],
      ...updates,
      updatedAt: new Date() // Tambahkan/perbarui timestamp update
    };

    // Ganti pesan lama dengan pesan baru di array
    messages[messageIndex] = updatedMessage;

    // Update timestamp chat juga
    this.updateChat(chatId, {}); // Ini hanya akan memperbarui updatedAt

    // console.log(`[MemoryStorage] Berhasil memperbarui pesan ${messageId} di chat ${chatId}.`);
    return updatedMessage;
  }

  /**
   * Delete all messages after a specific message (for edit flow)
   */
  async deleteMessagesAfter(chatId, messageId) {
    if (!this.messages.has(chatId)) {
      console.warn(`[MemoryStorage] deleteMessagesAfter: Chat ID ${chatId} tidak ditemukan.`);
      return { deleted: 0 };
    }

    const messages = this.messages.get(chatId);
    const messageIndex = messages.findIndex(msg => msg.id === messageId);

    if (messageIndex === -1) {
      console.warn(`[MemoryStorage] deleteMessagesAfter: Message ID ${messageId} tidak ditemukan.`);
      return { deleted: 0 };
    }

    // Get count of messages to delete
    const deleteCount = messages.length - messageIndex - 1;

    if (deleteCount > 0) {
      // Keep only messages up to and including the edited message
      const remainingMessages = messages.slice(0, messageIndex + 1);
      this.messages.set(chatId, remainingMessages);
      console.log(`[MemoryStorage] Deleted ${deleteCount} messages after message ${messageId}`);
    }

    return { deleted: deleteCount };
  }

  // ✅ NEW: Search functionality
  async searchChats(userId, query) {
    const userChats = await this.getChatsByUser(userId);

    if (!query || query.trim() === '') {
      return userChats;
    }

    const lowerQuery = query.toLowerCase();

    // Search in title and first message
    return userChats.filter(chat => {
      const titleMatch = chat.title.toLowerCase().includes(lowerQuery);
      return titleMatch;
    }).map(chat => ({
      ...chat,
      // Add relevance score for ranking
      relevance: chat.title.toLowerCase().startsWith(lowerQuery) ? 2 : 1
    })).sort((a, b) => b.relevance - a.relevance || new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  // ✅ NEW: Group management methods
  async getGroupsByUser(userId) {
    return Array.from(this.groups.values())
      .filter(group => group.userId === userId || group.userId === 'all')
      .sort((a, b) => a.order - b.order);
  }

  async getGroupById(groupId) {
    return this.groups.get(groupId) || null;
  }

  async createGroup(groupData) {
    const group = {
      id: `group-${Date.now()}`,
      name: groupData.name,
      userId: groupData.userId,
      color: groupData.color || '#3B82F6',
      icon: groupData.icon || '📁',
      order: groupData.order ?? this.groups.size,
      isCollapsed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.groups.set(group.id, group);
    return group;
  }

  async updateGroup(groupId, updates) {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const updatedGroup = {
      ...group,
      ...updates,
      updatedAt: new Date()
    };

    this.groups.set(groupId, updatedGroup);
    return updatedGroup;
  }

  async deleteGroup(groupId) {
    // Don't allow deleting default group
    if (groupId === 'uncategorized') {
      throw new Error('Cannot delete default group');
    }

    // Move all chats in this group to uncategorized
    for (const [chatId, chat] of this.chats.entries()) {
      if (chat.groupId === groupId) {
        this.chats.set(chatId, {
          ...chat,
          groupId: 'uncategorized'
        });
      }
    }

    this.groups.delete(groupId);
    return true;
  }

  async getChatsByGroup(userId, groupId) {
    return Array.from(this.chats.values())
      .filter(chat =>
        chat.userId === userId &&
        (chat.groupId || 'uncategorized') === groupId
      )
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

const globalForStorage = global;

export const memoryStorage =
  globalForStorage.memoryStorage || (globalForStorage.memoryStorage = new MemoryStorage());

export default MemoryStorage;