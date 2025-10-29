'use client'

import { useEffect, useRef } from 'react';
import { useChat } from '../../lib/hooks/useChat';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import LoadingSpinner from '../ui/LoadingSpinner';

export default function ChatInterface({ chatId}) {
  const {
    activeChat,
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearError,
    hasActiveChat,
    canSendMessage,
    selectChat,
  } = useChat();

  const messageListRef = useRef();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (chatId && (!activeChat || activeChat.id !== chatId)) {
      selectChat({ id: chatId });
    }
  }, [chatId, selectChat, activeChat]);

  /**
   * Handle new message submission - optimized
   */
  const handleSendMessage = async (content) => {
    if (!canSendMessage) return;
    try {
      await sendMessage(content);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  /**
   * Auto-scroll ke bottom hanya untuk pesan baru
   */
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollToBottom();
    }
  }, [messages]);

  /**
   * Clear error ketika component unmount
   */
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  // Loading state untuk initial chat load
  if (isLoading && !hasActiveChat) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header Placeholder */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="flex-1">
                <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-32 mt-1 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Loading Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600">Loading chat...</p>
          </div>
        </div>
        
        <div className="border-t border-gray-200 bg-white p-4">
          <MessageInput 
            onSendMessage={handleSendMessage}
            disabled={true}
            isStreaming={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white relative">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-800 text-sm">{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Chat Header - hanya tampil jika ada active chat */}
      {hasActiveChat && (
        <div className="sticky top-0 z-10 bg-white shadow-sm">
          <ChatHeader 
            chat={activeChat}
            connectionStatus={isStreaming ? 'streaming' : 'connected'}
          />
        </div>
      )}
      
      {/* Message Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {hasActiveChat ? (
          <MessageList 
            ref={messageListRef}
            messages={messages}
            isLoading={isLoading && messages.length === 0}
            isStreaming={isStreaming}
          />
        ) : (
          // Tidak ada active chat - tampilkan welcome message
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center max-w-md mx-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">
                Selamat datang di TmaChat
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Mulai Percakapan dengan TmaChat, Silahkan bertanya mengenai analisis dan prediksi AP, status WIFI
              </p>
              <div className="text-sm text-gray-500">
                <p>💡 Pilih Percakapan pada menu sidebar atau Buat percakapan</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200">
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={!hasActiveChat || isLoading || isStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}