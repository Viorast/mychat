/**
 * Fixed Message Bubble Component
 * ✅ FIXED: AI messages di kiri, User messages di kanan
 * Improved styling dan timestamp display
 */

export default function MessageBubble({ message, className = '', style, showTimestamp = true }) {
  const isAI = message.role === 'assistant'; // ✅ FIXED: Gunakan role untuk menentukan alignment
  
  return (
    <div 
      className={`flex mb-6 ${isAI ? 'justify-start' : 'justify-end'} ${className}`}
      style={style}
    >
      <div className={`max-w-[85%] flex ${isAI ? 'flex-row' : 'flex-row-reverse'} items-start space-x-3`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isAI 
            ? 'bg-gradient-to-br from-blue-500 to-purple-600' 
            : 'bg-gradient-to-br from-green-500 to-blue-600'
        }`}>
          {isAI ? (
            <span className="text-white text-xs font-bold">AI</span>
          ) : (
            <span className="text-white text-xs font-bold">You</span>
          )}
        </div>

        {/* Message Content */}
        <div className="flex flex-col space-y-1">
          <div
            className={`rounded-2xl px-4 py-3 ${
              isAI
                ? 'bg-white border border-gray-200 shadow-sm text-gray-800'
                : 'bg-blue-500 text-white'
            }`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>

          {/* Timestamp */}
          {showTimestamp && (
            <p className={`text-xs ${
              isAI ? 'text-gray-500 text-left' : 'text-gray-500 text-right'
            }`}>
              {new Date(message.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}