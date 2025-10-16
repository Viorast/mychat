// lib/hooks/useChat.js - FIXED VERSION
import { useCallback, useEffect, useRef } from 'react';
import { useChat as useChatContext } from '../context/ChatContext';
import { memoryStorage } from '../storage/memory';

export function useChat() {
  const {
    // State
    chats,
    activeChat,
    messages,
    isLoading,
    isStreaming,
    error,
    sidebarOpen,
    
    // Actions
    setLoading,
    setStreaming,
    setChats,
    setActiveChat,
    setMessages,
    addMessage,
    updateMessage,
    setError,
    clearError,
    toggleSidebar,
    setSidebarOpen,
  } = useChatContext();

  const activeChatRef = useRef(activeChat);
  const messagesRef = useRef(messages);

  // Sync refs dengan state terbaru
  useEffect(() => {
    activeChatRef.current = activeChat;
    messagesRef.current = messages;
  }, [activeChat, messages]);

  /**
   * Load chats from API
   */
  const loadChats = useCallback(async () => {
    try {
      setLoading(true);
      clearError();

      const response = await fetch('/api/chat?userId=default-user');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setChats(data.data);
      } else {
        throw new Error(data.error || 'Failed to load chats');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to load chats:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setChats, setError, clearError]);

  /**
   * Create new chat
   */
  const createChat = useCallback(async (title = 'New Chat') => {
    try {
      setLoading(true);
      clearError();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          userId: 'default-user',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        await loadChats(); // Reload chats list
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to create chat');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to create chat:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, clearError, loadChats]);

  /**
   * Select active chat
   */
  const selectChat = useCallback(async (chat) => {
    if (activeChatRef.current?.id === chat.id) {
      return;
    }

    try {
      setLoading(true);
      clearError();
      setActiveChat(chat);
      
      // ✅ GANTI DENGAN FETCH KE API
      const response = await fetch(`/api/chat/${chat.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();

      // Data dari API (chat object) mungkin sudah berisi pesan, atau Anda bisa sesuaikan API-nya
      // Berdasarkan route.js Anda, data.data berisi chat yang memiliki array messages.
      setMessages(data.success && data.data.messages ? data.data.messages : []);

    } catch (err) {
      setError(err.message);
      console.error('Failed to select chat:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveChat, setMessages, setError, clearError]);

  /**
   * ✅ FIXED: Send message dengan proper JSON handling
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim()) {
      console.warn('⚠️ Attempted to send empty message');
      return;
    }

    if (!activeChatRef.current) {
      console.error('❌ No active chat selected');
      setError('Please select or create a chat first');
      return;
    }

    try {
      setStreaming(true);
      clearError();

      const currentChat = activeChatRef.current;
      console.log('💬 Sending message to chat:', currentChat.id);

      // Create user message
      const userMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: content.trim(),
        role: 'user',
        timestamp: new Date().toISOString(),
        chatId: currentChat.id,
      };

      // Add user message to UI immediately
      addMessage(userMessage);
      console.log('✅ User message added to UI');

      // ✅ FIXED: Auto-generate chat title jika masih "New Chat"
      const shouldUpdateTitle = currentChat.title === 'New Chat' || currentChat.title === 'New Chat...';

      // Send to API - FIXED: menggunakan endpoint yang mengembalikan JSON
      const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          chatId: currentChat.id,
          updateTitle: shouldUpdateTitle,
        }),
      });

      console.log('📡 API Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // ✅ FIXED: Parse JSON response dengan error handling
      let data;
      try {
        const responseText = await response.text();
        console.log('📨 Raw API response:', responseText.substring(0, 200));
        
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError);
        throw new Error('Invalid JSON response from server');
      }

      if (data.success && data.data && data.data.assistantMessage) {
        // Add AI message to UI
        const aiMessage = {
          id: data.data.assistantMessage.id,
          content: data.data.assistantMessage.content,
          role: 'assistant',
          timestamp: data.data.assistantMessage.timestamp || new Date().toISOString(),
          chatId: currentChat.id,
        };
        
        addMessage(aiMessage);
        console.log('✅ Assistant message added to UI');
        
        // ✅ FIXED: Update active chat jika title berubah
        if (shouldUpdateTitle && data.data.updatedChat) {
          setActiveChat(data.data.updatedChat);
          await loadChats(); // Refresh chats list
        }

        console.log('✅ Message processed successfully');
      } else {
        throw new Error(data.error || 'Invalid response format from server');
      }
    } catch (err) {
      const errorMessage = err.message || 'Terjadi kesalahan saat mengirim pesan';
      setError(errorMessage);
      console.error('❌ Failed to send message:', err);
      
      // Add error message to chat
      const errorMessageObj = {
        id: `error-${Date.now()}`,
        content: 'Maaf, terjadi kesalahan. Silakan coba lagi.',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      addMessage(errorMessageObj);
    } finally {
      setStreaming(false);
    }
  }, [setStreaming, clearError, addMessage, setError, loadChats, setActiveChat]);

  /**
   * Delete chat
   */
  const deleteChat = useCallback(async (chatId) => {
    try {
      setLoading(true);
      clearError();

      // Untuk in-memory storage, hapus langsung
      await memoryStorage.deleteChat(chatId);
      
      await loadChats(); // Reload chats list
      
      // Clear active chat jika yang dihapus sedang aktif
      if (activeChatRef.current?.id === chatId) {
        setActiveChat(null);
        setMessages([]);
      }

    } catch (err) {
      setError(err.message);
      console.error('Failed to delete chat:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeChat, setLoading, setActiveChat, setMessages, setError, clearError, loadChats]);

  /**
   * Update chat title
   */
  const updateChatTitle = useCallback(async (chatId, newTitle) => {
    try {
      clearError();
      
      const updatedChat = await memoryStorage.updateChat(chatId, {
        title: newTitle
      });
      
      if (!updatedChat) {
        throw new Error('Chat not found');
      }

      // Update active chat jika sedang aktif
      if (activeChatRef.current?.id === chatId) {
        setActiveChat(updatedChat);
      }

      await loadChats(); // Refresh chats list
      
      return { success: true, data: updatedChat };
    } catch (err) {
      setError(err.message);
      console.error('Failed to update chat title:', err);
      throw err;
    }
  }, [setError, clearError, loadChats, setActiveChat]);

  /**
   * Test AI connection
   */
  const testAIConnection = useCallback(async () => {
    try {
      const response = await fetch('/api/gemini/stream', { method: 'GET' });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('AI connection test failed:', error);
      return { status: 'error', error: error.message };
    }
  }, []);

  /**
   * Clear all messages in current chat
   */
  const clearMessages = useCallback(async () => {
    if (!activeChatRef.current) return;

    try {
      await memoryStorage.clearChatMessages(activeChatRef.current.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear messages:', error);
      setError('Failed to clear messages');
    }
  }, [setMessages, setError]);

  /**
   * Load chats on mount
   */
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  return {
    // State
    chats,
    activeChat,
    messages,
    isLoading,
    isStreaming,
    error,
    sidebarOpen,

    // Actions
    loadChats,
    createChat,
    selectChat,
    sendMessage,
    deleteChat,
    updateChatTitle,
    clearMessages,
    clearError,
    testAIConnection,
    
    // Sidebar actions
    toggleSidebar,
    setSidebarOpen,
    
    // Utilities
    hasActiveChat: !!activeChat,
    canSendMessage: !isLoading && !isStreaming && !!activeChat,
  };
}

export default useChat;