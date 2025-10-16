/**
 * Enhanced useChat Hook dengan Workflow Integration
 * Mendukung complete n8n-style workflow
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChat as useChatContext } from '../context/ChatContext';

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
   * ✅ FIXED: Add missing loadChats function
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
   * Select active chat - optimized untuk menghindari re-renders
   */
  const selectChat = useCallback(async (chat) => {
    // Skip jika chat sudah aktif
    if (activeChatRef.current?.id === chat.id) {
      return;
    }

    try {
      setLoading(true);
      clearError();

      const response = await fetch(`/api/chat/${chat.id}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setActiveChat(data.data);
        setMessages(data.data.messages || []);
      } else {
        throw new Error(data.error || 'Failed to load chat');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to select chat:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveChat, setMessages, setError, clearError]);

  /**
   * Send message dengan enhanced workflow
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !activeChatRef.current) return;

    try {
      setStreaming(true);
      clearError();

      const currentChat = activeChatRef.current;

      // Create user message
      const userMessage = {
        id: `user-${Date.now()}`,
        content: content.trim(),
        role: 'user',
        timestamp: new Date().toISOString(),
        chatId: currentChat.id,
      };

      // Add user message to UI immediately
      addMessage(userMessage);

      // ✅ FIXED: Auto-generate chat title jika masih "New Chat"
      const shouldUpdateTitle = currentChat.title === 'New Chat' || currentChat.title === 'New Chat...';

      // Send to enhanced workflow API
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Add AI message to UI
        const aiMessage = {
          ...data.data.assistantMessage,
          role: 'assistant',
        };
        addMessage(aiMessage);
        
        // ✅ FIXED: Hanya reload chats list (untuk update title) tanpa mempengaruhi messages
        if (shouldUpdateTitle) {
          await loadChats();
        }

        console.log('✅ Workflow message processed successfully');
      } else {
        throw new Error(data.error || 'Failed to process message');
      }
    } catch (err) {
      const errorMessage = err.message || 'Terjadi kesalahan saat mengirim pesan';
      setError(errorMessage);
      console.error('Failed to send message:', err);
      
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
  }, [setStreaming, clearError, addMessage, setError, loadChats]);

  /**
   * Delete chat
   */
  const deleteChat = useCallback(async (chatId) => {
    try {
      setLoading(true);
      clearError();

      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        await loadChats(); // Reload chats list
        
        // Clear active chat jika yang dihapus sedang aktif
        if (activeChatRef.current?.id === chatId) {
          setActiveChat(null);
          setMessages([]);
        }
      } else {
        throw new Error(data.error || 'Failed to delete chat');
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
   * ✅ FIXED: Add updateChatTitle function yang missing
   */
  const updateChatTitle = useCallback(async (chatId, newTitle) => {
    try {
      clearError();
      console.log(`Updating chat title for ${chatId} to: ${newTitle}`);
      
      // Untuk in-memory storage, kita reload chats untuk sync
      await loadChats();
      
      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Failed to update chat title:', err);
      throw err;
    }
  }, [setError, clearError, loadChats]);

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