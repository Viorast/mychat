import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { settingsService } from '../../../../lib/services/settingsService';

/**
 * Admin guard helper
 */
async function requireAdmin(request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return { error: 'Unauthorized', status: 401 };
    }
    if (session.user.role !== 'admin') {
        return { error: 'Forbidden: Admin only', status: 403 };
    }
    return { session };
}

/**
 * GET /api/admin/settings
 * Ambil semua settings. API keys di-mask kecuali 4 karakter terakhir.
 */
export async function GET(request) {
    const auth = await requireAdmin(request);
    if (auth.error) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    try {
        const settings = await settingsService.getAll();

        // Mask API keys untuk keamanan
        const masked = { ...settings };
        const keyFields = ['openrouter_api_key', 'gemini_api_key'];
        for (const field of keyFields) {
            const val = masked[field] || '';
            if (val.length > 8) {
                masked[field] = '•'.repeat(val.length - 4) + val.slice(-4);
            } else if (val.length > 0) {
                masked[field] = '••••';
            }
        }

        return NextResponse.json({ success: true, settings: masked });
    } catch (error) {
        console.error('[Admin Settings GET] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/admin/settings
 * Update satu atau lebih settings.
 * Body: { key: value, ... }
 * Untuk API keys, body harus berisi nilai asli (bukan masked).
 */
export async function PUT(request) {
    const auth = await requireAdmin(request);
    if (auth.error) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    try {
        const body = await request.json();

        // Validasi
        const allowed = [
            'openrouter_api_key',
            'openrouter_model',
            'openrouter_vision_model',
            'gemini_api_key',
            'gemini_model',
            'active_database_context',
            'max_history_messages',
        ];

        const toUpdate = {};
        for (const key of allowed) {
            if (key in body) {
                let val = body[key];

                // Skip masked values (jangan overwrite dengan mask)
                if (typeof val === 'string' && val.includes('•')) continue;

                // Validasi max_history_messages
                if (key === 'max_history_messages') {
                    const num = parseInt(val, 10);
                    if (isNaN(num) || num < 4 || num > 19) {
                        return NextResponse.json(
                            { success: false, error: 'max_history_messages harus antara 4 dan 19' },
                            { status: 400 }
                        );
                    }
                    val = String(num);
                }

                // Validasi active_database_context
                if (key === 'active_database_context') {
                    if (!['SDA', 'DVO'].includes(val)) {
                        return NextResponse.json(
                            { success: false, error: 'active_database_context harus SDA atau DVO' },
                            { status: 400 }
                        );
                    }
                }

                toUpdate[key] = val;
            }
        }

        if (Object.keys(toUpdate).length === 0) {
            return NextResponse.json({ success: false, error: 'Tidak ada settings yang valid untuk diupdate' }, { status: 400 });
        }

        await settingsService.setMany(toUpdate);

        console.log(`[Admin Settings] Updated by ${auth.session.user.email}:`, Object.keys(toUpdate));

        return NextResponse.json({ success: true, message: 'Settings berhasil disimpan', updated: Object.keys(toUpdate) });
    } catch (error) {
        console.error('[Admin Settings PUT] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
