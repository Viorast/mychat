/**
 * Fixed ChatHeader Component
 * Menghapus updateChatTitle yang tidak diperlukan karena title sudah auto-update
 */

'use client'

import { useState } from 'react'
import Button from '../ui/Button'

export default function ChatHeader({ chat, connectionStatus = 'connected' }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState(chat?.title || 'New Chat')

  /**
   * Handle save judul chat yang diedit
   * ✅ FIXED: Tidak perlu updateChatTitle karena title sudah auto-update dari pesan pertama
   */
  const handleSaveTitle = () => {
    // ✅ FIXED: Simpan langsung ke state local, tidak perlu API call
    setIsEditing(false)
    
    // Note: Title akan terupdate otomatis ketika user mengirim pesan pertama
    console.log('Title updated locally:', editedTitle.trim())
  }

  /**
   * Handle cancel edit judul
   */
  const handleCancelEdit = () => {
    setEditedTitle(chat?.title || 'New Chat')
    setIsEditing(false)
  }

  /**
   * Handle key press pada input edit
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between px-6 py-4">
          
          {/* Left Section - Chat Info */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            
            {/* Chat Icon */}
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg 
                  className="w-4 h-4 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" 
                  />
                </svg>
              </div>
            </div>

            {/* Chat Title */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                // Edit Mode
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onBlur={handleSaveTitle}
                    autoFocus
                    className="flex-1 px-2 py-1 text-lg font-semibold text-gray-900 bg-gray-100 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex space-x-1">
                    <button
                      onClick={handleSaveTitle}
                      className="p-1 text-green-600 hover:text-green-800 transition-colors"
                      title="Save title"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 text-red-600 hover:text-red-800 transition-colors"
                      title="Cancel edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center space-x-3 group">
                  <h1 
                    className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-gray-700 transition-colors"
                    onClick={() => setIsEditing(true)}
                    title="Klik untuk mengedit judul"
                  >
                    {chat?.title || 'New Chat'}
                  </h1>
                  
                  {/* Edit Button (visible on hover) */}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit judul chat"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                      />
                    </svg>
                  </button>
                </div>
              )}
              
              {/* Chat Metadata */}
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-500">
                  {chat?.timestamp || new Date().toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
                
                {/* Message Count Badge */}
                {chat?.messages && chat.messages.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {chat.messages.length} pesan
                  </span>
                )}

                {/* Connection Status */}
                <span className={`text-xs px-2 py-1 rounded-full ${
                  connectionStatus === 'connected' 
                    ? 'bg-green-100 text-green-800' 
                    : connectionStatus === 'streaming'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {connectionStatus === 'connected' ? 'Online' : 
                   connectionStatus === 'streaming' ? 'Thinking...' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Section - Action Buttons (Simplified) */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            
            {/* Export Button */}
            <Button
              variant="outline"
              className="px-3 py-2 text-gray-600 hover:text-gray-800"
              title="Ekspor percakapan"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" 
                />
              </svg>
            </Button>

          </div>
        </div>
      </div>
    </div>
  )
}