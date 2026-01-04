import { NextResponse } from 'next/server';
import { createUserWithPassword, findUserByEmail } from '@/lib/services/userService';

/**
 * POST /api/auth/register
 * Register new user with email and password
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        // Validation
        if (!email || !password || !name) {
            return NextResponse.json(
                { error: 'Email, password, dan nama harus diisi' },
                { status: 400 }
            );
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Format email tidak valid' },
                { status: 400 }
            );
        }

        // Password strength validation
        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password minimal 6 karakter' },
                { status: 400 }
            );
        }

        // Check if email already exists
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return NextResponse.json(
                { error: 'Email sudah terdaftar' },
                { status: 409 }
            );
        }

        // Create user
        const user = await createUserWithPassword(email, password, name);

        return NextResponse.json({
            success: true,
            message: 'Registrasi berhasil',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        }, { status: 201 });

    } catch (error) {
        console.error('[Register API] Error:', error);

        if (error.message === 'Email sudah terdaftar') {
            return NextResponse.json(
                { error: error.message },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { error: 'Terjadi kesalahan server' },
            { status: 500 }
        );
    }
}
