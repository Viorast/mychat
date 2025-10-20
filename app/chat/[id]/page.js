'use client';

import { use } from 'react'; 
import MainLayout from '../../../components/layout/MainLayout';
import ChatInterface from '../../../components/chat/ChatInterface';

export default function ChatPage({ params }) {
  const resolvedParams = use(params);

  return (
    <MainLayout>
      <ChatInterface chatId={resolvedParams.id} />
    </MainLayout>
  );
}