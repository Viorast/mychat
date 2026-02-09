'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * ConfirmDialog - Simple modern confirmation modal
 * @param {boolean} isOpen - Whether the dialog is open
 * @param {string} title - Dialog title
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Text for confirm button
 * @param {string} cancelText - Text for cancel button
 * @param {string} variant - Variant style: 'danger' | 'warning' | 'info'
 * @param {function} onConfirm - Callback when confirmed
 * @param {function} onCancel - Callback when cancelled
 * @param {boolean} isLoading - Whether the confirm action is loading
 */
export default function ConfirmDialog({
    isOpen,
    title = 'Konfirmasi',
    message = 'Apakah Anda yakin?',
    confirmText = 'OK',
    cancelText = 'Batal',
    variant = 'danger',
    onConfirm,
    onCancel,
    isLoading = false,
}) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && !isLoading) {
                onCancel();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, isLoading, onCancel]);

    if (!isOpen) return null;

    // Variant styles
    const variantStyles = {
        danger: {
            confirmBtn: 'bg-blue-500 hover:bg-blue-600 text-white',
        },
        warning: {
            confirmBtn: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        },
        info: {
            confirmBtn: 'bg-blue-500 hover:bg-blue-600 text-white',
        },
    };

    const styles = variantStyles[variant] || variantStyles.danger;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isLoading) {
                    onCancel();
                }
            }}
            style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
            {/* Modal Box */}
            <div
                className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4"
                style={{ animation: 'slideIn 0.2s ease-out' }}
            >
                {/* Header - Dark Background */}
                <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-5 py-4 rounded-t-lg">
                    <h3 className="text-white text-base font-medium">
                        {title}
                    </h3>
                </div>

                {/* Content */}
                <div className="px-5 py-6">
                    <p className="text-gray-700 text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer Buttons */}
                <div className="px-5 pb-5 flex gap-2 justify-end">
                    {/* Confirm Button (OK) */}
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`min-w-[80px] px-4 py-2 rounded-md text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${styles.confirmBtn}`}
                    >
                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Proses...</span>
                            </div>
                        ) : (
                            confirmText
                        )}
                    </button>

                    {/* Cancel Button */}
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="min-w-[80px] px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {cancelText}
                    </button>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </div>
    );
}
