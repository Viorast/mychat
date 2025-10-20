'use client'

import { useState, useEffect } from 'react';
import { useChat } from '../../lib/hooks/useChat';
import { useRouter } from 'next/navigation';
import Button from '../ui/Button';

export default function Sidebar() {
  const {
    chats,
    activeChat,
    sidebarOpen,
    createChat,
    selectChat,
    toggleSidebar,
    setError,
    clearError,
  } = useChat();

  const router = useRouter();
  const [localChats, setLocalChats] = useState({});
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  /**
   * Group chats by timestamp untuk organized display
   */
  useEffect(() => {
    const today = new Date().toDateString();
    const groupedChats = {
      'Today': [],
      'Previous': []
    };

    chats.forEach(chat => {
      const chatDate = new Date(chat.createdAt).toDateString();
      if (chatDate === today) {
        groupedChats['Today'].push(chat);
      } else {
        groupedChats['Previous'].push(chat);
      }
    });

    setLocalChats(groupedChats);
  }, [chats]);

  const handleNewChat = async () => {
    if (isCreatingChat) return; // Prevent multiple clicks
    
    try {
      setIsCreatingChat(true);
      clearError();

      const newChat = await createChat();
      
      if (newChat) {
        console.log('New chat created successfully:', newChat.id);
        
        // Auto-close sidebar on mobile setelah memilih chat
        if (window.innerWidth < 768) {
          toggleSidebar();
        }
      }
    } catch (error) {
      console.error('Failed to create new chat:', error);
      setError(`Failed to create new chat: ${error.message}`);
    } finally {
      setIsCreatingChat(false);
    }
  };

  /**
   * Handle chat selection - FIXED: Better error handling
   */
  const handleSelectChat = (chat) => {
    router.push(`/chat/${chat.id}`);
    
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  // Jika sidebar tertutup, render toggle button saja
  if (!sidebarOpen) {
    return (
      <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Open sidebar"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <div className="mt-4">
          <button
            onClick={handleNewChat}
            disabled={isCreatingChat}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            title={isCreatingChat ? "Creating chat..." : "New chat"}
          >
            {isCreatingChat ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col transition-all duration-300">
      {/* Header dengan toggle button */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 ml-20">TMA CHAT</h1>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Close sidebar"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <Button 
          onClick={handleNewChat}
          disabled={isCreatingChat}
          className="w-full justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          {isCreatingChat ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Creating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </>
          )}
        </Button>
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4">
          {/* Today Section */}
          {localChats['Today']?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-3 px-2">Today</h3>
              {localChats['Today'].map(chat => (
                <ChatListItem 
                  key={chat.id}
                  chat={chat}
                  isActive={activeChat?.id === chat.id}
                  onClick={() => handleSelectChat(chat)}
                />
              ))}
            </div>
          )}

          {/* Previous Section */}
          {localChats['Previous'] && localChats['Previous'].length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-3 px-2">Previous</h3>
              {localChats['Previous'].map(chat => (
                <ChatListItem 
                  key={chat.id}
                  chat={chat}
                  isActive={activeChat?.id === chat.id}
                  onClick={() => handleSelectChat(chat)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {chats.length === 0 && (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">No chats yet</p>
              <p className="text-gray-400 text-xs mt-1">Start a new conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-white text-xs">RK</span>
          </div>
          <span className="text-sm font-medium text-gray-700">Risky Kusramdani</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual Chat List Item Component
 */
function ChatListItem({ chat, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg mb-2 transition-all duration-200 group ${
        isActive 
          ? 'bg-blue-50 border border-blue-200 shadow-sm' 
          : 'hover:bg-gray-50 border border-transparent'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate text-left">
            {chat.title}
          </p>
          <p className="text-xs text-gray-500 mt-1 text-left">
            {new Date(chat.createdAt).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
        </div>
        
        {/* Active indicator */}
        {isActive && (
          <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-2 flex-shrink-0" />
        )}
      </div>
    </button>
  );
}