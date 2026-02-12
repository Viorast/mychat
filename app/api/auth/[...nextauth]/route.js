import NextAuthModule from 'next-auth';
import CredentialsProviderModule from 'next-auth/providers/credentials';
import GoogleProviderModule from 'next-auth/providers/google';
import { validateCredentials, upsertGoogleUser, findUserById } from '@/lib/services/userService';

/**
 * NextAuth Configuration
 * Supports: Email/Password + Google OAuth
 */

// Validate NEXTAUTH_SECRET
if (!process.env.NEXTAUTH_SECRET) {
    console.error('❌ NEXTAUTH_SECRET is not defined in environment variables');
    throw new Error('NEXTAUTH_SECRET must be defined in .env file');
}

if (!process.env.NEXTAUTH_URL) {
    console.warn('⚠️ NEXTAUTH_URL is not defined, using default');
}

// Handle default exports properly for Next.js 15
const NextAuth = NextAuthModule.default || NextAuthModule;
const CredentialsProvider = CredentialsProviderModule.default || CredentialsProviderModule;
const GoogleProvider = GoogleProviderModule.default || GoogleProviderModule;

export const authOptions = {
    providers: [
        // Email/Password Provider
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email dan password harus diisi');
                }

                const result = await validateCredentials(
                    credentials.email,
                    credentials.password
                );

                if (!result.success) {
                    throw new Error(result.error);
                }

                return result.user;
            }
        }),

        // Google OAuth Provider
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            authorization: {
                params: {
                    prompt: 'consent',
                    access_type: 'offline',
                    response_type: 'code'
                }
            }
        })
    ],

    callbacks: {
        async signIn({ user, account, profile }) {
            // Handle Google sign-in
            if (account?.provider === 'google' && profile) {
                try {
                    const dbUser = await upsertGoogleUser(profile);
                    user.id = dbUser.id;
                    user.name = dbUser.name;
                    user.email = dbUser.email;
                    user.image = dbUser.avatar_url;
                    return true;
                } catch (error) {
                    console.error('[NextAuth] Google sign-in error:', error);
                    return false;
                }
            }
            return true;
        },

        async jwt({ token, user, account }) {
            // Initial sign in
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.name = user.name;
                token.picture = user.image || user.avatar_url;
            }
            return token;
        },

        async session({ session, token }) {
            // Send properties to the client
            if (session.user) {
                session.user.id = token.id;
                session.user.email = token.email;
                session.user.name = token.name;
                session.user.image = token.picture;
            }
            return session;
        },

        async redirect({ url, baseUrl }) {
            // After sign in, redirect to home
            if (url.startsWith('/')) return `${baseUrl}${url}`;
            if (new URL(url).origin === baseUrl) return url;
            return baseUrl;
        }
    },

    pages: {
        signIn: '/login',
        signOut: '/login',
        error: '/login',
    },

    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },

    // CRITICAL: NEXTAUTH_SECRET is required for production
    secret: process.env.NEXTAUTH_SECRET,

    // NEXTAUTH_URL for proper redirects
    url: process.env.NEXTAUTH_URL,

    debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
