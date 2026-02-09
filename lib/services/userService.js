import { appDb } from '../database/app-connection';
import bcrypt from 'bcryptjs';

/**
 * User Service - Database operations for users table
 */

// Hash password
export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
}

// Verify password
export async function verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}

// Find user by email
export async function findUserByEmail(email) {
    try {
        const result = await appDb.query(
            `SELECT id, email, name, auth_type, avatar_url, google_id, password_hash, 
                    created_at, last_login_at
             FROM users 
             WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[UserService] findUserByEmail error:', error);
        throw error;
    }
}

// Find user by ID
export async function findUserById(id) {
    try {
        const result = await appDb.query(
            `SELECT id, email, name, auth_type, avatar_url, google_id,
                    created_at, last_login_at
             FROM users 
             WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[UserService] findUserById error:', error);
        throw error;
    }
}

// Find user by Google ID
export async function findUserByGoogleId(googleId) {
    try {
        const result = await appDb.query(
            `SELECT id, email, name, auth_type, avatar_url, google_id,
                    created_at, last_login_at
             FROM users 
             WHERE google_id = $1 AND deleted_at IS NULL`,
            [googleId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[UserService] findUserByGoogleId error:', error);
        throw error;
    }
}

// Create new user with email/password
export async function createUserWithPassword(email, password, name) {
    try {
        const passwordHash = await hashPassword(password);

        const result = await appDb.query(
            `INSERT INTO users (email, name, password_hash, auth_type)
             VALUES ($1, $2, $3, 'user')
             RETURNING id, email, name, auth_type, avatar_url, created_at`,
            [email, name, passwordHash]
        );

        console.log(`[UserService] Created new user: ${email}`);
        return result.rows[0];
    } catch (error) {
        console.error('[UserService] createUserWithPassword error:', error);
        // Handle unique constraint violation
        if (error.code === '23505') {
            throw new Error('Email sudah terdaftar');
        }
        throw error;
    }
}

// Create or update user from Google OAuth
export async function upsertGoogleUser(profile) {
    try {
        const { sub: googleId, email, name, picture } = profile;

        // Check if user exists by google_id
        let user = await findUserByGoogleId(googleId);

        if (user) {
            // Update existing user
            const result = await appDb.query(
                `UPDATE users 
                 SET name = $1, avatar_url = $2, last_login_at = CURRENT_TIMESTAMP
                 WHERE google_id = $3
                 RETURNING id, email, name, auth_type, avatar_url`,
                [name, picture, googleId]
            );
            return result.rows[0];
        }

        // Check if email exists (user registered with password before)
        const existingEmail = await findUserByEmail(email);
        if (existingEmail) {
            // Link Google account to existing user
            const result = await appDb.query(
                `UPDATE users 
                 SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), last_login_at = CURRENT_TIMESTAMP
                 WHERE email = $3
                 RETURNING id, email, name, auth_type, avatar_url`,
                [googleId, picture, email]
            );
            return result.rows[0];
        }

        // Create new user
        const result = await appDb.query(
            `INSERT INTO users (email, name, google_id, avatar_url, auth_type)
             VALUES ($1, $2, $3, $4, 'user')
             RETURNING id, email, name, auth_type, avatar_url`,
            [email, name, googleId, picture]
        );

        console.log(`[UserService] Created new Google user: ${email}`);
        return result.rows[0];
    } catch (error) {
        console.error('[UserService] upsertGoogleUser error:', error);
        throw error;
    }
}

// Update last login timestamp
export async function updateLastLogin(userId) {
    try {
        await appDb.query(
            `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [userId]
        );
    } catch (error) {
        console.error('[UserService] updateLastLogin error:', error);
    }
}

// Validate login credentials
export async function validateCredentials(email, password) {
    try {
        const user = await findUserByEmail(email);

        if (!user) {
            return { success: false, error: 'Email tidak ditemukan' };
        }

        if (!user.password_hash) {
            return { success: false, error: 'Akun ini menggunakan login Google' };
        }

        const isValid = await verifyPassword(password, user.password_hash);

        if (!isValid) {
            return { success: false, error: 'Password salah' };
        }

        // Update last login
        await updateLastLogin(user.id);

        return {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url
            }
        };
    } catch (error) {
        console.error('[UserService] validateCredentials error:', error);
        return { success: false, error: 'Terjadi kesalahan server' };
    }
}
