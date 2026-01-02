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
      // Endpoint ini sekarang HANYA GET
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
   * Create new chat (HANYA membuat chat)
   */
  const createChat = useCallback(async (title = 'New Chat') => {
    try {
      setLoading(true);
      clearError();
      // Endpoint ini sekarang HANYA POST untuk create
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
   * Send message and handle streaming response (DIRUBAH)
   */
  const sendMessage = useCallback(async (messageData) => {
    const textContent = messageData.content?.trim() || '';
    const imageContent = messageData.image;

    if (!textContent && !imageContent) return;

    let currentChatId = activeChatRef.current?.id;

    if (!currentChatId) {
      try {
        const initialTitle = textContent ? textContent.substring(0, 20) + '...' : 'Chat with Image';
        const newChat = await createChat(initialTitle);
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

    const userMessagePayload = {
      id: `user-${Date.now()}`,
      content: textContent,
      role: 'user',
      timestamp: new Date().toISOString(),
      image: imageContent
    };
    addMessage(userMessagePayload);

    const assistantMessageId = `asst-${Date.now()}`;
    let assistantMessage = { id: assistantMessageId, content: '', role: 'assistant', timestamp: new Date().toISOString(), isStreaming: true };
    addMessage(assistantMessage);

    try {
      // ✅ PERUBAHAN: Panggil endpoint baru /api/chat/[chatId]/message
      const response = await fetch(`/api/chat/${currentChatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Body-nya HANYA berisi message dan image, tidak perlu chatId lagi di body
        body: JSON.stringify({ message: textContent, image: imageContent }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // ... sisa logika streaming (reader, decoder, dll) tetap SAMA ...
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let done = false;
      let finalContent = ''; // Kumpulkan konten final
      let hasErrorInStream = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'chunk' && data.content) {
                  finalContent += data.content;
                  updateMessage(assistantMessageId, { content: finalContent });
                } else if (data.type === 'complete' && data.isError) {
                  hasErrorInStream = true;
                } else if (data.type === 'error') {
                  console.error('Error received in stream:', data.error);
                  finalContent = `Error: ${data.error}`;
                  hasErrorInStream = true;
                  updateMessage(assistantMessageId, { content: finalContent, isError: true });
                  done = true;
                  break;
                }
              } catch (parseError) {
                console.warn('Failed to parse stream line:', line, parseError);
              }
            }
          }
        }
      }
      updateMessage(assistantMessageId, { content: finalContent, isStreaming: false, isError: hasErrorInStream });

    } catch (err) {
      console.error('Error sending message or processing stream:', err);
      setError(err.message);
      updateMessage(assistantMessageId, { content: 'Error: ' + err.message, isStreaming: false, isError: true });
    } finally {
      setStreaming(false);
      await loadChats();

      // ✅ IMPORTANT: Reload messages to get correct backend IDs for edit functionality
      try {
        const chatResponse = await fetch(`/api/chat/${currentChatId}`);
        const chatData = await chatResponse.json();
        if (chatData.success && chatData.data && chatData.data.messages) {
          setMessages(chatData.data.messages);
        }
      } catch (e) {
        console.warn('Failed to reload messages after send:', e);
      }
    }

    // Ini salah, jangan return { ...context, ... }
    // Cukup kembalikan state dan fungsi yang ada di akhir hook
    // (Abaikan, ini sudah benar di struktur aslinya)

  }, [addMessage, updateMessage, setError, clearError, setStreaming, loadChats, createChat, activeChatRef, context]);

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
        router.push('/');
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

  /**
   * ✅ UPDATED: Edit message with regeneration flow
   * 1. Edit the user message
   * 2. Delete all messages after it
   * 3. Regenerate AI response
   */
  const editMessage = useCallback(async (messageId, newContent) => {
    const currentChatId = activeChatRef.current?.id;

    if (!currentChatId) {
      throw new Error('No active chat');
    }

    try {
      clearError();

      // Step 1: Edit message and truncate subsequent messages
      const response = await fetch(`/api/chat/${currentChatId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newContent, truncateAfter: true }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to edit message');
      }

      console.log(`✏️  Message edited (${data.message.editCount}/3), deleted ${data.deletedCount} subsequent messages`);

      // Step 2: Reload messages to get updated state
      const chatResponse = await fetch(`/api/chat/${currentChatId}`);
      const chatData = await chatResponse.json();

      if (chatData.success && chatData.data) {
        setMessages(chatData.data.messages || []);
      }

      // Step 3: If messages were truncated, regenerate AI response
      if (data.shouldRegenerate) {
        // Send the edited message to get new AI response
        setStreaming(true);

        const aiResponse = await fetch(`/api/chat/${currentChatId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: newContent }),
        });

        if (aiResponse.ok && aiResponse.body) {
          const reader = aiResponse.body.getReader();
          const decoder = new TextDecoder();

          const assistantMessageId = `asst-${Date.now()}`;
          let assistantMessage = {
            id: assistantMessageId,
            content: '',
            role: 'assistant',
            timestamp: new Date().toISOString(),
            isStreaming: true
          };
          addMessage(assistantMessage);

          let done = false;
          let finalContent = '';

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const parsed = JSON.parse(line.slice(6));
                    if (parsed.type === 'chunk' && parsed.content) {
                      finalContent += parsed.content;
                      updateMessage(assistantMessageId, { content: finalContent });
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
          }

          updateMessage(assistantMessageId, { content: finalContent, isStreaming: false });
        }

        setStreaming(false);
      }

      return { success: true, message: data.message };
    } catch (err) {
      setStreaming(false);
      setError(err.message);
      console.error('Failed to edit message:', err);
      throw err;
    }
  }, [clearError, setError, setMessages, addMessage, updateMessage, setStreaming, activeChatRef]);

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
    editMessage,  // ✅ NEW: Export edit function
    clearError,
    toggleSidebar,
    setSidebarOpen,
    setActiveChat,
    refreshChats: loadChats,
    hasActiveChat: !!activeChat,
    canSendMessage: !isLoading && !isStreaming && !!activeChat,
  };
}