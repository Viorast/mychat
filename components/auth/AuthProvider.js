'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Auth Provider Wrapper
 * Wraps children with NextAuth SessionProvider
 */
export default function AuthProvider({ children }) {
    return (
        <SessionProvider>
            {children}
        </SessionProvider>
    );
}
