// app/api/chat/[chatId]/route.js - FINAL FIX
import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../../lib/storage/memory';

/**
 * GET /api/chat/[chatId] - Get specific chat dengan messages
 */
export async function GET(request, context) {
  try {
    const { chatId } = context.params; // Mengambil chatId dari context.params

    if (!chatId || chatId === 'undefined' || chatId === 'null') {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    console.log(`📖 Fetching chat with ID: ${chatId}`);

    const chat = await memoryStorage.getChatById(chatId);
    const messages = await memoryStorage.getMessagesByChat(chatId);

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const chatWithMessages = { ...chat, messages: messages || [] };

    return NextResponse.json({
      success: true,
      data: chatWithMessages,
    });

  } catch (error) {
    console.error(`GET /api/chat/[chatId] error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch chat', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, context) {
  try {
    const { chatId } = context.params; // Mengambil chatId dari context.params
    const body = await request.json();
    const { title } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Chat title is required' },
        { status: 400 }
      );
    }

    const updatedChat = await memoryStorage.updateChat(chatId, {
      title: title.trim(),
    });

    if (!updatedChat) {
      return NextResponse.json(
        { success: false, error: 'Chat not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedChat,
      message: 'Chat title updated successfully',
    });
    
  } catch (error) {
    console.error(`PUT /api/chat/${context.params.chatId} error:`, error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update chat',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/[chatId] - Delete chat
 */
//
export async function DELETE(request, context) {
  try {
    const { chatId } = context.params; // Mengambil chatId dari context.params

    if (!chatId || chatId === 'undefined' || chatId === 'null') {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting chat with ID: ${chatId}`);
    await memoryStorage.deleteChat(chatId);

    return NextResponse.json({
      success: true,
      message: 'Chat deleted successfully',
    });
    
  } catch (error) {
    console.error(`DELETE /api/chat/[chatId] error:`, error);
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