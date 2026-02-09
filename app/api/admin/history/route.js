import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../../lib/storage/database';

// Default User UUID
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/admin/history
 * Get all chats with message counts for admin overview
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId') || DEFAULT_USER_ID;

        console.log(`📊 Admin: Fetching history for user ${userId}`);

        // Get all chats for user
        const chats = await databaseStorage.getChatsByUser(userId);

        // Enrich with message counts
        const chatsWithCounts = await Promise.all(
            chats.map(async (chat) => {
                const messages = await databaseStorage.getMessagesByChat(chat.id);
                return {
                    ...chat,
                    messageCount: messages.length,
                    lastMessage: messages[messages.length - 1] || null
                };
            })
        );

        const totalMessages = chatsWithCounts.reduce((sum, chat) => sum + chat.messageCount, 0);

        console.log(`✅ Admin: Found ${chatsWithCounts.length} chats with ${totalMessages} total messages`);

        return NextResponse.json({
            success: true,
            data: chatsWithCounts,
            stats: {
                totalChats: chatsWithCounts.length,
                totalMessages: totalMessages,
                userId: userId
            }
        });

    } catch (error) {
        console.error('❌ GET /api/admin/history error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch history',
                details: error.message
            },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/history
 * Clear all chat history for a specific user or all users
 * ⚠️ DANGER: This is for development/testing purposes only!
 */
export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const clearAll = searchParams.get('clearAll') === 'true';

        if (clearAll) {
            // ⚠️ DANGER: Hard delete all chats
            console.warn('⚠️  Admin: CLEARING ALL CHAT HISTORY');

            const query = 'UPDATE chats SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL';
            const result = await databaseStorage.db.query(query);

            console.log(`🗑️  Admin: Soft deleted ALL chats (${result.rowCount} chats)`);

            return NextResponse.json({
                success: true,
                message: 'All chat history cleared (soft delete)',
                deletedChats: result.rowCount,
                type: 'all'
            });
        }

        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'userId parameter required (or clearAll=true for all users)'
                },
                { status: 400 }
            );
        }

        // Clear for specific user
        console.log(`🗑️  Admin: Clearing history for user ${userId}`);

        const deleteQuery = 'UPDATE chats SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND deleted_at IS NULL';
        const result = await databaseStorage.db.query(deleteQuery, [userId]);

        console.log(`✅ Admin: Deleted ${result.rowCount} chats for user ${userId}`);

        return NextResponse.json({
            success: true,
            message: `Chat history cleared for user ${userId}`,
            deletedChats: result.rowCount,
            userId: userId
        });

    } catch (error) {
        console.error('❌ DELETE /api/admin/history error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to delete history',
                details: error.message
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/history
 * Permanently delete soft-deleted records (cleanup)
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'cleanup') {
            console.log('🧹 Admin: Cleaning up soft-deleted records...');

            // Hard delete messages first (foreign key constraint)
            const messagesQuery = 'DELETE FROM messages WHERE deleted_at IS NOT NULL';
            const messagesResult = await databaseStorage.db.query(messagesQuery);

            // Then hard delete chats
            const chatsQuery = 'DELETE FROM chats WHERE deleted_at IS NOT NULL';
            const chatsResult = await databaseStorage.db.query(chatsQuery);

            console.log(`✅ Admin: Cleaned up ${messagesResult.rowCount} messages, ${chatsResult.rowCount} chats`);

            return NextResponse.json({
                success: true,
                message: 'Cleanup completed',
                deleted: {
                    messages: messagesResult.rowCount,
                    chats: chatsResult.rowCount
                }
            });
        }

        return NextResponse.json(
            { success: false, error: 'Unknown action' },
            { status: 400 }
        );

    } catch (error) {
        console.error('❌ POST /api/admin/history error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
