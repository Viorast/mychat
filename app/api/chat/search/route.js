import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../../lib/storage/database';

// Default User UUID
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const userId = searchParams.get('userId') || DEFAULT_USER_ID;

        console.log(`[Search API] Searching for: "${query}" (user: ${userId})`);

        const results = await databaseStorage.searchChats(userId, query);

        return NextResponse.json({
            success: true,
            results,
            count: results.length
        });
    } catch (error) {
        console.error('[Search API] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
