import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../lib/storage/database';

// Default User UUID
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// GET all groups for user
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId') || DEFAULT_USER_ID;

        const groups = await databaseStorage.getGroupsByUser(userId);

        return NextResponse.json({
            success: true,
            groups
        });
    } catch (error) {
        console.error('[GET /api/groups] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// CREATE new group
export async function POST(request) {
    try {
        const body = await request.json();
        const { name, color, icon, userId = DEFAULT_USER_ID } = body;

        if (!name || name.trim() === '') {
            return NextResponse.json(
                { success: false, error: 'Group name is required' },
                { status: 400 }
            );
        }

        const group = await databaseStorage.createGroup({
            name: name.trim(),
            color,
            icon,
            userId
        });

        console.log(`[POST /api/groups] Created group: ${group.name}`);

        return NextResponse.json({
            success: true,
            group
        }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/groups] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
