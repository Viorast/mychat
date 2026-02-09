'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';

/**
 * Parse table tag from AI response
 * Format: [TABLE]{json}[/TABLE]
 */
export function parseTableTag(content) {
    const tableRegex = /\[TABLE\]\s*(\{[\s\S]*?\})\s*\[\/TABLE\]/g;
    const matches = [];
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
        try {
            const config = JSON.parse(match[1]);
            matches.push({ config, fullMatch: match[0] });
        } catch (e) {
            console.error('Failed to parse table config:', e);
        }
    }

    return matches;
}

/**
 * Remove table tags from content
 */
export function removeTableTags(content) {
    return content.replace(/\[TABLE\]\s*\{[\s\S]*?\}\s*\[\/TABLE\]/g, '').trim();
}

/**
 * SimpleTable Component
 */
export default function SimpleTable({ config, onVisualize }) {
    const { title, columns = [], rows = [] } = config;
    const [showVisualizeHint, setShowVisualizeHint] = useState(false);

    // Check if data can be visualized (has numeric values)
    const canVisualize = rows.length > 0 && rows.some(row =>
        row.some(cell => !isNaN(parseFloat(cell)) && isFinite(cell))
    );

    const handleVisualize = () => {
        if (onVisualize && canVisualize) {
            // Convert table data to chart format
            const chartData = rows.map(row => {
                const obj = {};
                columns.forEach((col, idx) => {
                    const value = row[idx];
                    // Try to parse as number
                    const numValue = parseFloat(value);
                    obj[col] = !isNaN(numValue) ? numValue : value;
                });
                return obj;
            });

            onVisualize({
                title: title || 'Data Visualization',
                data: chartData,
                columns: columns
            });
        }
    };

    return (
        <div className="my-4">
            {/* Table Container */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Title */}
                {title && (
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-800">
                            {title}
                        </h3>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                            <tr>
                                {columns.map((col, idx) => (
                                    <th
                                        key={idx}
                                        className="px-5 py-3 font-semibold tracking-wider border-b border-gray-100 whitespace-nowrap"
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className={`hover:bg-gray-50 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                >
                                    {row.map((cell, cellIdx) => (
                                        <td
                                            key={cellIdx}
                                            className="px-5 py-3 text-gray-700 whitespace-normal max-w-[200px] md:max-w-[300px] break-words"
                                            title={typeof cell === 'string' && cell.length > 50 ? cell : undefined}
                                        >
                                            {/* Render code-style for certain columns */}
                                            {columns[cellIdx]?.toLowerCase().includes('tipe') ||
                                                columns[cellIdx]?.toLowerCase().includes('constraint') ||
                                                columns[cellIdx]?.toLowerCase().includes('kolom') ||
                                                columns[cellIdx]?.toLowerCase() === 'id' ? (
                                                <code className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-purple-600 text-xs font-mono">
                                                    {cell}
                                                </code>
                                            ) : (
                                                cell
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
