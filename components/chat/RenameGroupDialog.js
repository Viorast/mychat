'use client';

import { useState, useEffect, useRef } from 'react';

export default function RenameGroupDialog({ group, onRename, onCancel }) {
    const [newName, setNewName] = useState(group?.name || '');
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

        if (!newName.trim() || newName.trim() === group.name) {
            onCancel();
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/groups/${group.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });

            const data = await response.json();

            if (data.success) {
                onRename(data.group);
            } else {
                alert('Failed to rename group: ' + data.error);
            }
        } catch (error) {
            console.error('Rename group error:', error);
            alert('Failed to rename group');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!group) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Rename Group</h3>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter group name..."
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
                            disabled={isSubmitting || !newName.trim()}
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
