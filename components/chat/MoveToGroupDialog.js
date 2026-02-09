'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

export default function MoveToGroupDialog({ chat, groups, onMove, onCancel, onCreateGroup }) {
    const [selectedGroupId, setSelectedGroupId] = useState(chat?.groupId || 'uncategorized');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (isCreatingNew) {
            // Create new group and move chat to it
            if (!newGroupName.trim()) return;

            setIsSubmitting(true);
            try {
                const newGroup = await onCreateGroup(newGroupName.trim());
                if (newGroup) {
                    await onMove(chat, newGroup.id);
                }
            } catch (error) {
                console.error('Create group error:', error);
            } finally {
                setIsSubmitting(false);
            }
        } else {
            // Move to selected existing group
            if (selectedGroupId === chat?.groupId) {
                onCancel();
                return;
            }

            setIsSubmitting(true);
            try {
                await onMove(chat, selectedGroupId);
            } catch (error) {
                console.error('Move to group error:', error);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    if (!chat) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Move to Group</h3>

                <p className="text-sm text-gray-600 mb-4">
                    Move "{chat.title.substring(0, 30)}{chat.title.length > 30 ? '...' : ''}" to:
                </p>

                {/* Existing Groups */}
                <div className="space-y-2 mb-4">
                    {groups.map(group => (
                        <button
                            key={group.id}
                            onClick={() => {
                                setSelectedGroupId(group.id);
                                setIsCreatingNew(false);
                            }}
                            disabled={isSubmitting}
                            className={`
                w-full text-left px-4 py-3 rounded-lg border-2 transition-all
                ${selectedGroupId === group.id && !isCreatingNew
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }
                ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
              `}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{group.icon}</span>
                                    <span className="font-medium">{group.name}</span>
                                </div>
                                {selectedGroupId === group.id && !isCreatingNew && (
                                    <Check className="w-5 h-5 text-blue-500" />
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Create New Group Option */}
                <div className="border-t border-gray-200 pt-4 mb-4">
                    <button
                        onClick={() => {
                            setIsCreatingNew(true);
                            setSelectedGroupId('');
                        }}
                        disabled={isSubmitting}
                        className={`
              w-full text-left px-4 py-3 rounded-lg border-2 transition-all
              ${isCreatingNew
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }
              ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">➕</span>
                                <span className="font-medium">Create New Group</span>
                            </div>
                            {isCreatingNew && (
                                <Check className="w-5 h-5 text-blue-500" />
                            )}
                        </div>
                    </button>

                    {/* New Group Name Input */}
                    {isCreatingNew && (
                        <div className="mt-3 pl-4">
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="Enter group name..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                disabled={isSubmitting}
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || (isCreatingNew && !newGroupName.trim())}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Moving...' : isCreatingNew ? 'Create & Move' : 'Move'}
                    </button>
                </div>
            </div>
        </div>
    );
}
