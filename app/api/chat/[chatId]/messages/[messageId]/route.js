import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../../../../lib/storage/memory';

/**
 * PATCH /api/chat/[chatId]/messages/[messageId]
 * Update message content and optionally delete subsequent messages for regeneration
 */
export async function PATCH(request, context) {
    try {
        const { chatId, messageId } = await context.params;
        const body = await request.json();
        const { content, truncateAfter = true } = body;

        console.log(`[API] Editing message ${messageId} in chat ${chatId}, truncate: ${truncateAfter}`);

        if (!content || !content.trim()) {
            return NextResponse.json(
                { success: false, error: 'Message content is required' },
                { status: 400 }
            );
        }

        // Get all messages for this chat
        const messages = await memoryStorage.getMessagesByChat(chatId);

        if (!messages || messages.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Chat has no messages' },
                { status: 404 }
            );
        }

        // Find the message by ID
        const currentMessage = messages.find(msg => msg.id === messageId);

        if (!currentMessage) {
            console.log(`[API] Message ${messageId} not found. Available:`, messages.map(m => m.id));
            return NextResponse.json(
                { success: false, error: 'Message not found' },
                { status: 404 }
            );
        }

        // Check if message is from user
        if (currentMessage.role !== 'user') {
            return NextResponse.json(
                { success: false, error: 'Only user messages can be edited' },
                { status: 403 }
            );
        }

        // Check edit limit
        const currentEditCount = currentMessage.editCount || 0;
        if (currentEditCount >= 3) {
            return NextResponse.json(
                { success: false, error: 'Edit limit reached (maximum 3 edits)' },
                { status: 400 }
            );
        }

        // Update the message
        const updatedMessage = await memoryStorage.updateMessage(chatId, messageId, {
            content: content.trim(),
            editCount: currentEditCount + 1,
            lastEditedAt: new Date()
        });

        // Delete all messages after this one (for regeneration flow)
        let deletedCount = 0;
        if (truncateAfter) {
            const result = await memoryStorage.deleteMessagesAfter(chatId, messageId);
            deletedCount = result.deleted;
            console.log(`[API] Truncated ${deletedCount} messages after edit`);
        }

        console.log(`✏️  Message ${messageId} edited (${updatedMessage.editCount}/3)`);

        return NextResponse.json({
            success: true,
            message: updatedMessage,
            truncated: truncateAfter,
            deletedCount: deletedCount,
            shouldRegenerate: truncateAfter && deletedCount > 0
        });

    } catch (error) {
        console.error('PATCH error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
