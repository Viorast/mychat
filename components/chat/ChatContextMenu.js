'use client';

import { useState, useRef, useEffect } from 'react';
import { Edit, Trash2, FolderInput } from 'lucide-react';

export default function ChatContextMenu({
    chat,
    position,
    onClose,
    onRename,
    onDelete,
    onMoveToGroup
}) {
    const menuRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                onClose();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!position) return null;

    return (
        <div
            ref={menuRef}
            className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]"
            style={{
                top: `${position.y}px`,
                left: `${position.x}px`,
            }}
        >
            <button
                onClick={() => {
                    onRename(chat);
                    onClose();
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 text-sm"
            >
                <Edit className="w-4 h-4" />
                Rename
            </button>

            <button
                onClick={() => {
                    onMoveToGroup(chat);
                    onClose();
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 text-sm"
            >
                <FolderInput className="w-4 h-4" />
                Move to Group
            </button>

            <div className="border-t border-gray-200 my-1" />

            <button
                onClick={() => {
                    onDelete(chat);
                    onClose();
                }}
                className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 text-sm"
            >
                <Trash2 className="w-4 h-4" />
                Delete
            </button>
        </div>
    );
}
