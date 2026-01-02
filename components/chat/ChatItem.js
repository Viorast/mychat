'use client';

import { useRouter } from 'next/navigation';
import { MoreVertical } from 'lucide-react';

export default function ChatItem({ chat, isActive, onContextMenu }) {
    const router = useRouter();

    const handleClick = () => {
        router.push(`/chat/${chat.id}`);
    };

    const handleThreeDotsClick = (e) => {
        e.stopPropagation(); // Prevent chat navigation onClick
        onContextMenu?.({
            chat,
            position: { x: e.clientX, y: e.clientY }
        });
    };

    return (
        <div
            onClick={handleClick}
            className={`
        px-4 py-3 cursor-pointer transition-all duration-200 group relative
        ${isActive
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : 'hover:bg-gray-50'
                }
      `}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                        {chat.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                        {new Date(chat.updatedAt || chat.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </p>
                </div>

                {/* Three Dots Vertical Icon - FIX: Always show, better visibility */}
                <button
                    onClick={handleThreeDotsClick}
                    className="opacity-0 group-hover:opacity-100 md:opacity-100 p-1.5 hover:bg-gray-200 rounded transition-all flex-shrink-0"
                    aria-label="Chat options"
                >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
            </div>
        </div>
    );
}
