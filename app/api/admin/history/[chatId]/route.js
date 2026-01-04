import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../../../lib/storage/database';

/**
 * DELETE /api/admin/history/[chatId]
 * Delete specific chat by ID (soft delete for admin)
 */
export async function DELETE(request, context) {
    try {
        const { chatId } = await context.params;

        if (!chatId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Chat ID required'
                },
                { status: 400 }
            );
        }

        console.log(`🗑️  Admin: Deleting chat ${chatId}`);

        // Check if chat exists
        const chat = await databaseStorage.getChatById(chatId);
        if (!chat) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Chat not found'
                },
                { status: 404 }
            );
        }

        // Soft delete the chat (messages will be soft-deleted via trigger or cascade)
        await databaseStorage.deleteChat(chatId);

        console.log(`✅ Admin: Deleted chat ${chatId} - "${chat.title}"`);

        return NextResponse.json({
            success: true,
            message: `Chat deleted: ${chat.title}`,
            deletedChat: {
                id: chat.id,
                title: chat.title,
                userId: chat.user_id
            }
        });

    } catch (error) {
        console.error('❌ DELETE /api/admin/history/[chatId] error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to delete chat',
                details: error.message
            },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/history/[chatId]
 * Get specific chat with all messages (admin view)
 */
export async function GET(request, context) {
    try {
        const { chatId } = await context.params;

        if (!chatId) {
            return NextResponse.json(
                { error: 'Chat ID required' },
                { status: 400 }
            );
        }

        const chat = await databaseStorage.getChatById(chatId);
        if (!chat) {
            return NextResponse.json(
                { error: 'Chat not found' },
                { status: 404 }
            );
        }

        const messages = await databaseStorage.getMessagesByChat(chatId);

        return NextResponse.json({
            success: true,
            data: {
                ...chat,
                messages: messages,
                messageCount: messages.length
            }
        });

    } catch (error) {
        console.error('❌ GET /api/admin/history/[chatId] error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
