/**
 * Enhanced MessageInput dengan Better Empty State Handling
 * Memberikan feedback yang jelas ketika input disabled
 */

'use client'

import { useState, useRef, useEffect } from 'react';
import Button from '../ui/Button';

export default function MessageInput({ onSendMessage, disabled, isStreaming }) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef(null);

  /**
   * Handle send message
   */
  const handleSend = () => {
    if (message.trim() && !disabled && !isStreaming) {
      onSendMessage(message);
      setMessage('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle IME composition (for languages like Chinese, Japanese)
   */
  const handleComposition = (e) => {
    if (e.type === 'compositionstart') {
      setIsComposing(true);
    }
    if (e.type === 'compositionend') {
      setIsComposing(false);
    }
  };

  /**
   * Auto-resize textarea
   */
  const handleInput = (e) => {
    setMessage(e.target.value);
    
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  /**
   * Auto-focus textarea ketika component mount
   */
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const canSend = message.trim() && !disabled && !isStreaming;

  // Determine placeholder message based on state
  const getPlaceholder = () => {
    if (isStreaming) return "AI is thinking...";
    if (disabled) return "Please select or create a chat to start messaging...";
    return "Message TmaChat... (Press Enter to send)";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="flex space-x-3 items-end">
        
        {/* Message Input */}
        <div className={`flex-1 rounded-2xl border transition-all duration-200 ${
          disabled || isStreaming
            ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
            : 'bg-white border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200'
        }`}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleComposition}
            onCompositionEnd={handleComposition}
            placeholder={getPlaceholder()}
            disabled={disabled || isStreaming}
            rows="1"
            className="w-full bg-transparent border-none resize-none py-3 px-4 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-0 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        
        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className={`px-6 py-3 transition-all duration-200 flex-shrink-0 ${
            canSend
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title={canSend ? "Send message" : 
                disabled ? "Select a chat first" : 
                isStreaming ? "AI is responding..." : "Type a message"}
        >
          {isStreaming ? (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send</span>
            </div>
          )}
        </Button>
      </div>

      {/* Helper Text */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        {isStreaming ? (
          "AI is generating response... Please wait"
        ) : disabled ? (
          "💡 Create a new chat or select one from the sidebar to start messaging"
        ) : (
          "Press Enter to send, Shift+Enter for new line"
        )}
      </div>
    </div>
  );
}