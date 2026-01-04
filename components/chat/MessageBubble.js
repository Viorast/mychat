'use client';

import { useState } from 'react';
import { Edit2, Check, X as XIcon, Copy, Check as CheckIcon } from 'lucide-react';
import ImageModal from '../ui/ImageModal';
import ChartRenderer, { parseChartTag, removeChartTags } from './ChartRenderer';
import SimpleTable, { parseTableTag, removeTableTags } from './SimpleTable';

const getImageUrl = (imageData) => {
    if (imageData && imageData.base64 && imageData.mimeType) {
        return `data:${imageData.mimeType};base64,${imageData.base64}`;
    }
    return null;
};

/**
 * Parse AI message content including suggestions, charts, and tables
 */
const parseAIContent = (content) => {
    if (!content) return { textContent: content, suggestions: [], charts: [], tables: [] };

    // Parse charts
    const charts = parseChartTag(content);
    let processedContent = removeChartTags(content);

    // Parse tables
    const tables = parseTableTag(processedContent);
    processedContent = removeTableTags(processedContent);

    // Parse suggestions
    const saranMatch = processedContent.match(/\[SARAN\]:?\s*([\s\S]*)/i);
    let textContent = processedContent;
    const suggestions = [];

    if (saranMatch) {
        textContent = processedContent.substring(0, saranMatch.index).trim();
        const saranText = saranMatch[1];
        const lines = saranText.split('\n');

        for (const line of lines) {
            const match = line.match(/^\d+\.\s*(.+)$/);
            if (match && match[1].trim()) {
                suggestions.push(match[1].trim());
            }
        }
    }

    return { textContent, suggestions, charts, tables };
};

// Legacy function for backward compatibility
const parseSuggestions = (content) => {
    const result = parseAIContent(content);
    return { mainContent: result.textContent, suggestions: result.suggestions };
};

export default function MessageBubble({
    message,
    className = '',
    style,
    showTimestamp = true,
    onEdit,
    onCopy
}) {
    const isAI = message.role === 'assistant';
    const imageUrl = !isAI && message.image ? getImageUrl(message.image) : null;

    // Parse AI content including charts, tables, and suggestions
    const parsedContent = isAI
        ? parseAIContent(message.content)
        : { textContent: message.content, suggestions: [], charts: [], tables: [] };

    const { textContent, suggestions, charts, tables } = parsedContent;
    // For backward compatibility
    const mainContent = textContent;

    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(message.content || '');
    const [showImageModal, setShowImageModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const editCount = message.editCount || 0;
    const canEdit = !isAI && editCount < 3 && onEdit;

    const handleStartEdit = () => {
        setEditedContent(message.content || '');
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setEditedContent(message.content || '');
        setIsEditing(false);
    };

    const handleSaveEdit = async () => {
        if (editedContent.trim() === message.content) {
            setIsEditing(false);
            return;
        }

        if (!editedContent.trim()) {
            alert('Message cannot be empty');
            return;
        }

        setIsSaving(true);
        try {
            await onEdit(message.id, editedContent.trim());
            setIsEditing(false);
        } catch (error) {
            console.error('Edit error:', error);
            alert('Failed to edit message: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Copy error:', error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    return (
        <div
            className={`flex mb-6 ${isAI ? 'justify-start' : 'justify-end'} ${className}`}
            style={style}
        >
            <div className={`max-w-[85%] flex ${isAI ? 'flex-row' : 'flex-row-reverse'} items-start space-x-3 group`}>

                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAI
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
                <div className="flex flex-col space-y-1 flex-1">
                    {/* Edit Mode - Blue Background Design */}
                    {isEditing ? (
                        <div className="bg-blue-500 rounded-2xl p-4 shadow-lg">
                            <textarea
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full px-3 py-2 border-2 border-blue-300 bg-blue-600 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent text-sm resize-none min-h-[80px]"
                                rows={3}
                                disabled={isSaving}
                                autoFocus
                            />
                            <div className="flex gap-2 justify-end mt-3">
                                <button
                                    onClick={handleCancelEdit}
                                    disabled={isSaving}
                                    className="px-4 py-1.5 text-sm bg-white text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1 font-medium"
                                >
                                    <XIcon className="w-4 h-4" />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={isSaving || !editedContent.trim()}
                                    className="px-4 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-1 font-medium"
                                >
                                    <CheckIcon className="w-4 h-4" />
                                    {isSaving ? 'Saving...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Display Mode */
                        <>
                            <div
                                className={`rounded-2xl px-4 py-3 ${isAI
                                    ? 'bg-white border border-gray-200 shadow-sm text-gray-800'
                                    : 'bg-blue-500 text-white'
                                    }`}
                            >
                                {/* Tampilkan Gambar jika ada */}
                                {imageUrl && (
                                    <div className="mb-2">
                                        <img
                                            src={imageUrl}
                                            alt="Lampiran pengguna"
                                            className="max-w-xs max-h-48 rounded cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => setShowImageModal(true)}
                                            title="Click to view full size"
                                        />
                                    </div>
                                )}

                                {/* Message Text - Use mainContent (without suggestions) */}
                                {mainContent && (
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                        {mainContent}
                                    </p>
                                )}

                                {/* Edit Indicator */}
                                {editCount > 0 && (
                                    <p className={`text-xs mt-2 ${isAI ? 'text-gray-400' : 'text-white/70'}`}>
                                        (Edited {editCount}x)
                                    </p>
                                )}
                            </div>

                            {/* Render Charts */}
                            {isAI && charts.length > 0 && (
                                <div className="mt-2">
                                    {charts.map((chart, idx) => (
                                        <ChartRenderer
                                            key={idx}
                                            chartType={chart.chartType}
                                            config={chart.config}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Render Tables */}
                            {isAI && tables.length > 0 && (
                                <div className="mt-2">
                                    {tables.map((table, idx) => (
                                        <SimpleTable
                                            key={idx}
                                            config={table.config}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Action Icons - Below Bubble, Visible on Hover */}
                            <div className={`flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isAI ? 'justify-start' : 'justify-end'
                                }`}>
                                {/* Copy Button */}
                                <button
                                    onClick={handleCopy}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Copy message"
                                >
                                    {copied ? (
                                        <CheckIcon className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </button>

                                {/* Edit Button - Only for user messages */}
                                {canEdit && (
                                    <button
                                        onClick={handleStartEdit}
                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                        title={`Edit message (${3 - editCount} edits remaining)`}
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Timestamp */}
                            {showTimestamp && (
                                <p className={`text-xs ${isAI ? 'text-gray-500 text-left' : 'text-gray-500 text-right'
                                    }`}>
                                    {new Date(message.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Image Modal */}
            {showImageModal && imageUrl && (
                <ImageModal
                    imageUrl={imageUrl}
                    alt="Message attachment"
                    onClose={() => setShowImageModal(false)}
                />
            )}
        </div>
    );
}
