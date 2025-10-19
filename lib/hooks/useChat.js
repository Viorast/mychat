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
      
      const response = await fetch(`/api/chat/${chat.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();

      setMessages(data.success && data.data.messages ? data.data.messages : []);

    } catch (err) {
      setError(err.message);
      console.error('Failed to select chat:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveChat, setMessages, setError, clearError]);

  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !activeChatRef.current) {
      setError('Please select a chat and type a message.');
      return;
    }

    setStreaming(true);
    clearError();

    const userMessage = {
      id: `user-${Date.now()}`,
      content: content.trim(),
      role: 'user',
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);

    const assistantMessageId = `asst-${Date.now()}`;
    let assistantMessage = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    addMessage(assistantMessage);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: content,
                chatId: activeChatRef.current.id,
            }),
        });

        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            const chunk = decoder.decode(value, { stream: true });
            
            // Process Server-Sent Events
            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'chunk') {
                        assistantMessage.content += data.content;
                        updateMessage(assistantMessageId, { content: assistantMessage.content });
                    }
                }
            }
        }
    } catch (err) {
        setError(err.message);
        updateMessage(assistantMessageId, { content: 'Error: ' + err.message, isError: true });
    } finally {
        updateMessage(assistantMessageId, { isStreaming: false });
        setStreaming(false);
        loadChats();
    }
}, [addMessage, updateMessage, setError, clearError, setStreaming, loadChats]);

const deleteChat = useCallback(async (chatId) => {
  try {
    setLoading(true);
    clearError();

    await memoryStorage.deleteChat(chatId);
    
    await loadChats(); 
    
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

const updateChatTitle = useCallback(async (chatId, newTitle) => {
    try {
      clearError();

      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update title');
      }

      const updatedChat = data.data;

      if (activeChatRef.current?.id === chatId) {
        setActiveChat(updatedChat);
      }

      await loadChats(); 
      
      return { success: true, data: updatedChat };
    } catch (err) {
      setError(err.message);
      console.error('Failed to update chat title:', err);
      throw err;
    }
  }, [setError, clearError, loadChats, setActiveChat, activeChatRef]);

  return {
    chats,
    activeChat,
    messages,
    isLoading,
    isStreaming,
    error,
    sidebarOpen,
    loadChats,
    createChat,
    selectChat,
    sendMessage,
    deleteChat,
    updateChatTitle,
    clearError,
    toggleSidebar,
    setSidebarOpen,
    hasActiveChat: !!activeChat,
    canSendMessage: !isLoading && !isStreaming && !!activeChat,
  };
}