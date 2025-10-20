'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@/lib/hooks/useChat';
import MainLayout from '@/components/layout/MainLayout';
import ChatInterface from '@/components/chat/ChatInterface';

export default function Home() {
  const { loadChats, activeChat, setActiveChat, setMessages } = useChat();
  const router = useRouter();

  // Load chats pada initial render
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (activeChat) {
      setActiveChat(null);
      setMessages([]);
    }
  }, [setActiveChat, setMessages]);


  return (
    <MainLayout>
      <ChatInterface />
    </MainLayout>
  );
}