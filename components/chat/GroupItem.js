'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MoreVertical } from 'lucide-react';
import ChatItem from './ChatItem';

export default function GroupItem({
    group,
    chats,
    activeChatId,
    onChatContextMenu,
    onGroupContextMenu
}) {
    const [isCollapsed, setIsCollapsed] = useState(group.isCollapsed || false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    return (
        <div className="mb-2">
            {/* Group Header */}
            <div className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center gap-2 flex-1" onClick={toggleCollapse}>
                    {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="text-sm">{group.icon}</span>
                    <span className="text-sm font-medium text-gray-700">{group.name}</span>
                    <span className="text-xs text-gray-400">({chats.length})</span>
                </div>

                {group.id !== 'uncategorized' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onGroupContextMenu?.({
                                group,
                                position: { x: e.clientX, y: e.clientY }
                            });
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                    >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                )}
            </div>

            {/* Chats in Group */}
            {!isCollapsed && (
                <div>
                    {chats.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400 italic">
                            No chats in this group
                        </div>
                    ) : (
                        chats.map(chat => (
                            <ChatItem
                                key={chat.id}
                                chat={chat}
                                isActive={chat.id === activeChatId}
                                onContextMenu={onChatContextMenu}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
