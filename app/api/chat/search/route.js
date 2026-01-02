import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const userId = searchParams.get('userId') || 'default-user';

        console.log(`[Search API] Searching for: "${query}" (user: ${userId})`);

        const results = await storage.searchChats(userId, query);

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
