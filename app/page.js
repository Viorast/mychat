/**
 * Main Page dengan Chat Integration
 */

'use client'

import { useEffect } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import Sidebar from '@/components/layout/Sidebar';
import ChatInterface from '@/components/chat/ChatInterface';

export default function Home() {
  const { loadChats, chats, createChat, selectChat, activeChat } = useChat();

  /**
   * Load chats pada initial render
   */
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  /**
   * Handle new chat creation
   */
  const handleNewChat = async () => {
    try {
      const newChat = await createChat();
      if (newChat) {
        await selectChat(newChat);
      }
    } catch (error) {
      // Error dihandle oleh useChat hook
      console.error('Failed to create new chat:', error);
    }
  };

  /**
   * Handle chat selection
   */
  const handleSelectChat = async (chat) => {
    try {
      await selectChat(chat);
    } catch (error) {
      // Error dihandle oleh useChat hook
      console.error('Failed to select chat:', error);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar Navigation */}
      <Sidebar 
        chats={chats}
        activeChat={activeChat}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
      />
      
      {/* Main Chat Area */}
      <ChatInterface />
    </div>
  );
}