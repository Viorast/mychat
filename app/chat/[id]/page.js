'use client';

import MainLayout from '@/components/layout/MainLayout';
import ChatInterface from '../../../components/chat/ChatInterface';

export default function ChatPage({ params }) {
  return (
    <MainLayout>
      <ChatInterface chatId={params.id} />
    </MainLayout>
  );
}