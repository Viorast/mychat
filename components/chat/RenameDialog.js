'use client';

import { useState, useEffect, useRef } from 'react';

export default function RenameDialog({ chat, onRename, onCancel }) {
    const [newTitle, setNewTitle] = useState(chat?.title || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!newTitle.trim() || newTitle.trim() === chat.title) {
            onCancel();
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/chat/${chat.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() })
            });

            const data = await response.json();

            if (data.success) {
                onRename(data.chat);
            } else {
                alert('Failed to rename: ' + data.error);
            }
        } catch (error) {
            console.error('Rename error:', error);
            alert('Failed to rename chat');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!chat) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Rename Chat</h3>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter new title..."
                        disabled={isSubmitting}
                    />

                    <div className="flex gap-2 mt-4 justify-end">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !newTitle.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
