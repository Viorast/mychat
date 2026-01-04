'use client';

import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';

// Default User UUID
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export default function SearchBar({ onSearch, onClear }) {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Debounce search
    const debounce = useCallback((func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    }, []);

    const handleSearch = debounce(async (searchQuery) => {
        if (!searchQuery.trim()) {
            onClear?.();
            return;
        }

        setIsSearching(true);
        try {
            const response = await fetch(`/api/chat/search?q=${encodeURIComponent(searchQuery)}&userId=${DEFAULT_USER_ID}`);
            const data = await response.json();

            if (data.success) {
                onSearch?.(data.results);
            }
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    }, 300);

    const handleChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        handleSearch(value);
    };

    const handleClear = () => {
        setQuery('');
        onClear?.();
    };

    return (
        <div className="relative px-3 py-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder="Search chats..."
                    className="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {query && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
            {isSearching && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                </div>
            )}
        </div>
    );
}
