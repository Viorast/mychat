import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat as useChatContext } from '../context/ChatContext';
import { useRouter } from 'next/navigation';

export function useChat() {
  const context = useChatContext();
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

  const router = useRouter();
  const activeChatRef = useRef(activeChat);
  const [hasLoadedInitialChats, setHasLoadedInitialChats] = useState(false);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

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

  useEffect(() => {
    if (!hasLoadedInitialChats) {
      loadChats();
      setHasLoadedInitialChats(true);
    }
  }, [hasLoadedInitialChats, loadChats]);

  /**
   * Create new chat
   */
  const createChat = useCallback(async (title = 'New Chat') => {
    try {
      setLoading(true);
      clearError();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, userId: 'default-user' }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await loadChats(); // Muat ulang daftar chat
        const newChat = data.data;
        setActiveChat(newChat); // Langsung set sebagai chat aktif
        setMessages([]); // Kosongkan pesan untuk chat baru
        router.push(`/chat/${newChat.id}`); // Navigasi ke halaman chat baru
        return newChat;
      } else {
        throw new Error(data.error || 'Failed to create chat');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, clearError, loadChats, setActiveChat, setMessages, router]);

  /**
   * Select active chat
   */
  const selectChat = useCallback(async (chat) => {
    if (activeChatRef.current?.id === chat.id) {
      return;
    }
    try {
      setLoading(true);
      context.clearError();
      
      const response = await fetch(`/api/chat/${chat.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();

      if (data.success && data.data) {
        setActiveChat(data.data);
        setMessages(data.data.messages || []);
      } else {
        throw new Error(data.error || 'Chat data not found');
      }
    } catch (err) {
      context.setError(err.message);
      console.error('Failed to select chat:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveChat, setMessages, context.setError, context.clearError]);

  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim()) return;

    let currentChatId = activeChatRef.current?.id;

    // Jika tidak ada chat aktif, buat dulu!
    if (!currentChatId) {
      try {
        const newChat = await createChat('New Chat...'); // createChat sudah handle navigasi & set active
        if (newChat) {
          currentChatId = newChat.id;
        } else {
          throw new Error("Failed to create a new chat to send message.");
        }
      } catch (err) {
        context.setError(err.message);
        return;
      }
    }

    setStreaming(true);
    clearError();
    const userMessage = { id: `user-${Date.now()}`, content: content.trim(), role: 'user', timestamp: new Date().toISOString() };
    addMessage(userMessage);

    const assistantMessageId = `asst-${Date.now()}`;
    let assistantMessage = { id: assistantMessageId, content: '', role: 'assistant', timestamp: new Date().toISOString(), isStreaming: true };
    addMessage(assistantMessage);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content, chatId: currentChatId }),
        });

        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            const chunk = decoder.decode(value, { stream: true });
            
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
        context.updateMessage(assistantMessageId, { isStreaming: false });
        context.setStreaming(false);
        await loadChats();
    }
    
  return { ...context, loadChats, createChat, selectChat, sendMessage };
}, [addMessage, updateMessage, setError, clearError, setStreaming, loadChats, createChat]);

const deleteChat = useCallback(async (chatId) => {
    try {
      setLoading(true);
      clearError();
      const response = await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete chat');
      
      await loadChats();
      if (activeChatRef.current?.id === chatId) {
        setActiveChat(null);
        setMessages([]);
        router.push('/'); // Kembali ke halaman utama jika chat aktif dihapus
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveChat, setMessages, setError, clearError, loadChats, router]);

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
    deleteChat,
    selectChat,
    sendMessage,
    updateChatTitle,
    clearError,
    toggleSidebar,
    setSidebarOpen,
    hasActiveChat: !!activeChat,
    canSendMessage: !isLoading && !isStreaming && !!activeChat,
  };
}