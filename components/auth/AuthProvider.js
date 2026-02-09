'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Auth Provider Wrapper
 * Wraps children with NextAuth SessionProvider
 * 
 * SessionProvider handles:
 * - Session state management
 * - Auto-refresh of session
 * - Context for useSession hook
 */
export default function AuthProvider({ children }) {
    return (
        <SessionProvider
            // Refetch session every 5 minutes
            refetchInterval={5 * 60}
            // Refetch when window gets focus
            refetchOnWindowFocus={true}
        >
            {children}
        </SessionProvider>
    );
}
