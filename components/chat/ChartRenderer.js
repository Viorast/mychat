'use client';

import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { downloadAsPNG, generateFilename } from '@/lib/utils/chartDownload';

// Color palette for charts
const COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#f97316', '#eab308',
    '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
];

/**
 * Parse chart config from AI response
 * Format: [CHART:type]{json}[/CHART]
 */
export function parseChartTag(content) {
    const chartRegex = /\[CHART:(\w+)\]\s*(\{[\s\S]*?\})\s*\[\/CHART\]/g;
    const matches = [];
    let match;

    while ((match = chartRegex.exec(content)) !== null) {
        try {
            const chartType = match[1].toLowerCase();
            const config = JSON.parse(match[2]);
            matches.push({ chartType, config, fullMatch: match[0] });
        } catch (e) {
            console.error('Failed to parse chart config:', e);
        }
    }

    return matches;
}

/**
 * Remove chart tags from content to get plain text
 */
export function removeChartTags(content) {
    return content.replace(/\[CHART:\w+\]\s*\{[\s\S]*?\}\s*\[\/CHART\]/g, '').trim();
}

/**
 * ChartRenderer Component
 */
export default function ChartRenderer({ chartType, config }) {
    const chartRef = useRef(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const { title, data, xKey = 'name', yKey = 'value', yLabel = '' } = config;

    const handleDownload = async () => {
        if (!chartRef.current || isDownloading) return;

        setIsDownloading(true);
        try {
            const filename = generateFilename(title);
            await downloadAsPNG(chartRef.current, filename);
        } finally {
            setIsDownloading(false);
        }
    };

    const renderChart = () => {
        switch (chartType) {
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}
                            />
                            <Legend />
                            <Bar dataKey={yKey} fill="#6366f1" radius={[4, 4, 0, 0]}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'line':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px'
                                }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey={yKey}
                                stroke="#6366f1"
                                strokeWidth={2}
                                dot={{ fill: '#6366f1', strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'pie':
                return (
                    <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                labelLine={true}
                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                outerRadius={120}
                                fill="#8884d8"
                                dataKey={yKey}
                                nameKey={xKey}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px'
                                }}
                            />
                            <Legend
                                layout="vertical"
                                align="right"
                                verticalAlign="middle"
                                wrapperStyle={{ fontSize: '12px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                );

            default:
                return <p className="text-gray-500">Unsupported chart type: {chartType}</p>;
        }
    };

    return (
        <div className="my-4">
            {/* Chart Container */}
            <div
                ref={chartRef}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
                {/* Header with title and download button */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">
                        {title || 'Visualisasi Data'}
                    </h3>
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                        title="Download as PNG"
                    >
                        <Download className="w-4 h-4" />
                        <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                    </button>
                </div>

                {/* Chart */}
                {renderChart()}
            </div>
        </div>
    );
}
