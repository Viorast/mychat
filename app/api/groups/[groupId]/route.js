import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../../lib/storage/database';

// UPDATE group
export async function PATCH(request, context) {
    const { groupId } = await context.params;

    try {
        const updates = await request.json();

        const updatedGroup = await databaseStorage.updateGroup(groupId, updates);

        if (!updatedGroup) {
            return NextResponse.json(
                { success: false, error: 'Group not found' },
                { status: 404 }
            );
        }

        console.log(`[PATCH /api/groups/${groupId}] Updated group: ${updatedGroup.name}`);

        return NextResponse.json({
            success: true,
            group: updatedGroup
        });
    } catch (error) {
        console.error(`[PATCH /api/groups/${groupId}] Error:`, error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// DELETE group
export async function DELETE(request, context) {
    const { groupId } = await context.params;

    try {
        await databaseStorage.deleteGroup(groupId);

        console.log(`[DELETE /api/groups/${groupId}] Deleted group`);

        return NextResponse.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (error) {
        console.error(`[DELETE /api/groups/${groupId}] Error:`, error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
