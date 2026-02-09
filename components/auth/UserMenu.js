'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, ChevronDown } from 'lucide-react';

/**
 * Generate initials from name
 * "Rafa Zidan" → "RZ"
 * "Yandi" → "Y"
 * "John Doe Smith" → "JS" (first and last)
 */
function getInitials(name) {
    if (!name) return 'U';

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
        // Single name: take first letter
        return words[0][0].toUpperCase();
    } else {
        // Multiple names: take first and last initial
        const firstInitial = words[0][0];
        const lastInitial = words[words.length - 1][0];
        return (firstInitial + lastInitial).toUpperCase();
    }
}

/**
 * UserMenu Component
 * Simple dropdown with profile name and logout
 */
export default function UserMenu() {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/login' });
    };

    if (status === 'loading') {
        return (
            <div className="user-menu-skeleton">
                <div className="avatar-skeleton"></div>
            </div>
        );
    }

    if (!session) {
        return null;
    }

    const user = session.user;
    const initials = getInitials(user.name || user.email);

    return (
        <div className="user-menu" ref={menuRef}>
            <button
                className="user-menu-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="User menu"
            >
                {user.image ? (
                    <img
                        src={user.image}
                        alt={user.name || 'User'}
                        className="user-avatar"
                    />
                ) : (
                    <div className="user-avatar-initials">
                        {initials}
                    </div>
                )}
                <span className="user-name-display">{user.name || 'User'}</span>
                <ChevronDown size={14} className={`chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="user-menu-dropdown">
                    {/* Profile Info */}
                    <div className="profile-section">
                        {user.image ? (
                            <img
                                src={user.image}
                                alt={user.name || 'User'}
                                className="profile-avatar"
                            />
                        ) : (
                            <div className="profile-avatar-initials">
                                {initials}
                            </div>
                        )}
                        <div className="profile-info">
                            <span className="profile-name">{user.name || 'User'}</span>
                            <span className="profile-email">{user.email}</span>
                        </div>
                    </div>

                    <div className="menu-divider"></div>

                    {/* Logout Button */}
                    <button className="logout-button" onClick={handleLogout}>
                        <LogOut size={16} />
                        <span>Keluar</span>
                    </button>
                </div>
            )}

            <style jsx>{`
                .user-menu {
                    position: relative;
                }

                .user-menu-trigger {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 8px 4px 4px;
                    background: transparent;
                    border: none;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .user-menu-trigger:hover {
                    background: rgba(0, 0, 0, 0.05);
                }

                .user-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .user-avatar-initials {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .user-name-display {
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 140px;
                }

                .chevron {
                    color: #6b7280;
                    transition: transform 0.2s;
                }

                .chevron.open {
                    transform: rotate(180deg);
                }

                .user-menu-dropdown {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 0;
                    min-width: 220px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    border: 1px solid #e5e7eb;
                    overflow: hidden;
                    z-index: 100;
                    animation: slideUp 0.15s ease-out;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .profile-section {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                }

                .profile-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                }

                .profile-avatar-initials {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .profile-info {
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .profile-name {
                    font-weight: 600;
                    color: #1e293b;
                    font-size: 14px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .profile-email {
                    font-size: 12px;
                    color: #64748b;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .menu-divider {
                    height: 1px;
                    background: #e5e7eb;
                }

                .logout-button {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    padding: 12px 16px;
                    background: none;
                    border: none;
                    font-size: 14px;
                    color: #dc2626;
                    cursor: pointer;
                    transition: background 0.15s;
                    text-align: left;
                }

                .logout-button:hover {
                    background: #fef2f2;
                }

                .user-menu-skeleton {
                    padding: 4px;
                }

                .avatar-skeleton {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.5s infinite;
                }

                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
}
