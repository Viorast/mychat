import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Middleware for Protected Routes
 * Redirects unauthenticated users to login page
 */

export default withAuth(
    function middleware(req) {
        // Request is authenticated, continue
        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token, req }) => {
                // Check if user has valid token
                return !!token;
            }
        },
        pages: {
            signIn: '/login',
        }
    }
);

// Protect these routes
export const config = {
    matcher: [
        // Protect main chat routes
        '/',
        '/chat/:path*',
        // Protect API routes except auth
        '/api/chat/:path*',
        '/api/groups/:path*',
        '/api/admin/:path*',
    ]
};
