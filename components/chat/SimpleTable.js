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
            <div className="bg-gray-900 rounded-xl overflow-hidden">
                {/* Title */}
                {title && (
                    <div className="px-4 py-3 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-white">
                            {title}
                        </h3>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-700">
                                {columns.map((col, idx) => (
                                    <th
                                        key={idx}
                                        className="px-4 py-3 text-left text-gray-300 font-medium"
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className={`border-b border-gray-800 ${rowIdx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/50'}`}
                                >
                                    {row.map((cell, cellIdx) => (
                                        <td
                                            key={cellIdx}
                                            className="px-4 py-3 text-gray-100"
                                        >
                                            {/* Render code-style for certain columns */}
                                            {columns[cellIdx]?.toLowerCase().includes('tipe') ||
                                                columns[cellIdx]?.toLowerCase().includes('constraint') ||
                                                columns[cellIdx]?.toLowerCase().includes('kolom') ? (
                                                <code className="px-1.5 py-0.5 bg-gray-700 rounded text-purple-300 text-xs">
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

                {/* Visualize Button */}
                {canVisualize && (
                    <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
                        <button
                            onClick={handleVisualize}
                            onMouseEnter={() => setShowVisualizeHint(true)}
                            onMouseLeave={() => setShowVisualizeHint(false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <BarChart3 className="w-4 h-4" />
                            <span>Visualisasikan</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
