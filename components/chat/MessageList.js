import React, { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import LoadingSpinner from '../ui/LoadingSpinner';

const MessageList = forwardRef(({ messages, isLoading, isStreaming }, ref) => {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  /**
   * Expose scroll methods ke parent component
   */
  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      messagesEndRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    },
    
    scrollToTop: () => {
      containerRef.current?.scrollTo({ 
        top: 0, 
        behavior: 'smooth' 
      });
    },
  }));

  const handleAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    
    if (hasNewMessages && isNearBottom) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: 'smooth' 
        });
      }, 100);
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    handleAutoScroll();
  }, [handleAutoScroll]);

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div 
        ref={containerRef}
        className="h-full overflow-y-auto custom-scrollbar bg-gray-50"
      >
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Start a conversation
            </h3>
            <p className="text-gray-600 text-sm">
              Send a message to begin chatting with TmaChat AI. 
              Ask questions, get help, or just have a conversation!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto custom-scrollbar bg-gray-50"
    >
      <div className="max-w-4xl mx-auto py-6 px-4">
        {/* Loading indicator untuk initial load */}
        {isLoading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Messages dengan optimized rendering */}
        {messages.map((message, index) => (
          <MessageBubble 
            key={message.id}
            message={message}
            isStreaming={message.isStreaming}
            showTimestamp={index === messages.length - 1 || 
              messages[index + 1]?.role !== message.role}
            className="message-enter"
            style={{ 
              animationDelay: `${Math.min(index * 0.05, 0.5)}s` 
            }}
          />
        ))}
        
        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="flex justify-start mb-4">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200 max-w-[70%]">
              <div className="flex items-center space-x-2">
                <LoadingSpinner size="sm" />
                <span className="text-sm text-gray-500">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Scroll anchor */}
        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;