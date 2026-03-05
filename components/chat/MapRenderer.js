'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Maximize2, Minimize2, Download } from 'lucide-react';

/**
 * Parse [MAP]{json}[/MAP] tags from AI response
 */
export function parseMapTag(content) {
    const mapRegex = /\[MAP\]\s*(\{[\s\S]*?\})\s*\[\/MAP\]/g;
    const matches = [];
    let match;

    while ((match = mapRegex.exec(content)) !== null) {
        try {
            const config = JSON.parse(match[1]);
            matches.push({ config, fullMatch: match[0] });
        } catch (e) {
            console.error('Failed to parse map config:', e);
        }
    }

    return matches;
}

/**
 * Remove [MAP] tags from content
 */
export function removeMapTags(content) {
    return content.replace(/\[MAP\]\s*\{[\s\S]*?\}\s*\[\/MAP\]/g, '').trim();
}

/**
 * MapRenderer Component — renders an interactive Leaflet map
 * Loaded dynamically to avoid SSR issues with Leaflet
 */
export default function MapRenderer({ config }) {
    const mapRef = useRef(null);
    const leafletMapRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(null);

    const { title, markers = [], center, zoom = 5 } = config;

    // Auto-calculate center if not provided
    const computedCenter = center || (() => {
        const validMarkers = markers.filter(m => m.lat != null && m.lng != null);
        if (validMarkers.length === 0) return [-2.5, 118.0]; // Indonesia center
        const avgLat = validMarkers.reduce((s, m) => s + Number(m.lat), 0) / validMarkers.length;
        const avgLng = validMarkers.reduce((s, m) => s + Number(m.lng), 0) / validMarkers.length;
        return [avgLat, avgLng];
    })();

    useEffect(() => {
        let map = null;

        const initMap = async () => {
            try {
                // Dynamic import to avoid SSR issues
                const L = (await import('leaflet')).default;

                // Fix default marker icon path issue with Next.js
                delete L.Icon.Default.prototype._getIconUrl;
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                });

                if (!mapRef.current || leafletMapRef.current) return;

                map = L.map(mapRef.current, {
                    center: computedCenter,
                    zoom: zoom,
                    zoomControl: true,
                    scrollWheelZoom: true,
                });

                leafletMapRef.current = map;

                // OpenStreetMap tiles — free, no API key
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19,
                }).addTo(map);

                // Color-coded marker icons
                const createIcon = (status) => {
                    const color = status === 'Down' ? '#ef4444'
                        : status === 'Up' ? '#22c55e'
                            : '#3b82f6';

                    return L.divIcon({
                        className: '',
                        html: `
                            <div style="
                                width: 28px; height: 28px;
                                background: ${color};
                                border: 3px solid white;
                                border-radius: 50% 50% 50% 0;
                                transform: rotate(-45deg);
                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            "></div>
                        `,
                        iconSize: [28, 28],
                        iconAnchor: [14, 28],
                        popupAnchor: [0, -28],
                    });
                };

                // Add markers
                const validMarkers = markers.filter(m => {
                    const lat = Number(m.lat);
                    const lng = Number(m.lng);
                    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
                });

                validMarkers.forEach((marker) => {
                    const icon = createIcon(marker.status);
                    const statusBadge = marker.status
                        ? `<span style="
                            display:inline-block; padding:2px 8px; border-radius:9999px;
                            font-size:11px; font-weight:600; color:white;
                            background:${marker.status === 'Down' ? '#ef4444' : '#22c55e'};
                            margin-left:4px;
                          ">${marker.status}</span>`
                        : '';

                    const popupContent = `
                        <div style="min-width:160px; font-family:sans-serif;">
                            <div style="font-weight:700; font-size:13px; margin-bottom:6px; color:#1e293b;">
                                ${marker.label || 'AP'}${statusBadge}
                            </div>
                            ${marker.info ? `<div style="font-size:12px; color:#64748b; line-height:1.5;">${marker.info}</div>` : ''}
                            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
                                📍 ${Number(marker.lat).toFixed(5)}, ${Number(marker.lng).toFixed(5)}
                            </div>
                        </div>
                    `;

                    L.marker([Number(marker.lat), Number(marker.lng)], { icon })
                        .addTo(map)
                        .bindPopup(popupContent);
                });

                // Fit bounds to all markers if multiple
                if (validMarkers.length > 1 && !center) {
                    const bounds = L.latLngBounds(
                        validMarkers.map(m => [Number(m.lat), Number(m.lng)])
                    );
                    map.fitBounds(bounds, { padding: [30, 30] });
                }

                setIsLoaded(true);
            } catch (err) {
                console.error('Map init error:', err);
                setError(err.message);
            }
        };

        initMap();

        return () => {
            if (leafletMapRef.current) {
                leafletMapRef.current.remove();
                leafletMapRef.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Invalidate map size when fullscreen changes
    useEffect(() => {
        if (leafletMapRef.current) {
            setTimeout(() => leafletMapRef.current?.invalidateSize(), 100);
        }
    }, [isFullscreen]);

    const validCount = markers.filter(m => m.lat != null && m.lng != null && Number(m.lat) !== 0).length;
    const downCount = markers.filter(m => m.status === 'Down').length;
    const upCount = markers.filter(m => m.status === 'Up').length;

    if (error) {
        return (
            <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                ⚠️ Gagal memuat peta: {error}
            </div>
        );
    }

    return (
        <div className={`my-4 ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-black/60 flex items-center justify-center' : ''}`}>
            <div className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden ${isFullscreen ? 'w-full max-w-5xl h-[90vh] flex flex-col' : ''}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <h3 className="text-sm font-semibold text-gray-700">
                            {title || 'Peta Lokasi'}
                        </h3>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Legend */}
                        {(downCount > 0 || upCount > 0) && (
                            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                                {downCount > 0 && (
                                    <span className="flex items-center gap-1">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                                        Down ({downCount})
                                    </span>
                                )}
                                {upCount > 0 && (
                                    <span className="flex items-center gap-1">
                                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
                                        Up ({upCount})
                                    </span>
                                )}
                                {validCount - downCount - upCount > 0 && (
                                    <span className="flex items-center gap-1">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                                        Lainnya ({validCount - downCount - upCount})
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Fullscreen toggle */}
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Map container */}
                <div className={`relative ${isFullscreen ? 'flex-1' : 'h-[380px]'}`}>
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                            <div className="flex items-center gap-2 text-gray-500 text-sm">
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                Memuat peta...
                            </div>
                        </div>
                    )}
                    <div ref={mapRef} className="w-full h-full" />
                </div>

                {/* Footer stats */}
                {validCount > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                        <span>{validCount} titik lokasi ditampilkan</span>
                        {validCount < markers.length && (
                            <span className="text-amber-500">
                                ⚠️ {markers.length - validCount} lokasi tidak memiliki koordinat
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
