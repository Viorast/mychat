'use client';

import { useEffect } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * ImageModal - Lightbox component for viewing images in full screen
 * @param {string} imageUrl - URL of the image to display
 * @param {string} alt - Alt text for the image
 * @param {function} onClose - Callback when modal is closed
 */
export default function ImageModal({ imageUrl, alt = 'Image', onClose }) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    if (!imageUrl) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                aria-label="Close"
            >
                <X className="w-6 h-6 text-white" />
            </button>

            {/* Image Container */}
            <div
                className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image
            >
                <img
                    src={imageUrl}
                    alt={alt}
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />
            </div>

            {/* Helper Text */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                Press ESC or click outside to close
            </div>
        </div>
    );
}
