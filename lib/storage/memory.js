class MemoryStorage {
  constructor() {
    this.chats = new Map();
    this.messages = new Map();
    // this.init();
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
}

const globalForStorage = global;

export const memoryStorage =
  globalForStorage.memoryStorage || (globalForStorage.memoryStorage = new MemoryStorage());

export default MemoryStorage;