# Authentication Setup Guide for TmaChat

## Required Environment Variables

Add these to your `.env` file:

```bash
# =============================================
# 🔐 NEXTAUTH CONFIGURATION
# =============================================

# Generate secret: openssl rand -base64 32
NEXTAUTH_SECRET=your-super-secret-key-here-min-32-chars

# Your app URL (change for production)
NEXTAUTH_URL=http://localhost:3000

# =============================================
# 🔑 GOOGLE OAUTH (Optional - for Google Login)
# =============================================

# Get from: https://console.cloud.google.com/apis/credentials
# Create OAuth 2.0 Client ID and add authorized redirect URI:
# http://localhost:3000/api/auth/callback/google

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Setup Steps

### 1. Generate NEXTAUTH_SECRET
```bash
# Linux/Mac
openssl rand -base64 32

# Or use online generator
# https://generate-secret.vercel.app/32
```

### 2. Configure Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
4. Application type: "Web application"
5. Add authorized redirect URI:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
6. Copy Client ID and Client Secret to your `.env`

### 3. Database Setup

The authentication uses the existing `users` table. Make sure your database has the required schema:

```sql
-- Users table should have these columns:
-- id, email, name, auth_type, avatar_url, google_id, password_hash, 
-- created_at, updated_at, last_login_at, deleted_at
```

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Login page (email/password + Google) |
| `/register` | Registration page |
| `/api/auth/[...nextauth]` | NextAuth API routes |
| `/api/auth/register` | Registration API |

## Protected Routes

All routes are protected by default except:
- `/login`
- `/register`
- `/api/auth/*`

Unauthenticated users will be redirected to `/login`.

## Testing

1. Start the dev server: `npm run dev`
2. Visit `http://localhost:3000` (should redirect to `/login`)
3. Register a new account or login
4. After login, you'll be redirected to the chat interface
