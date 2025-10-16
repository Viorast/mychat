/**
 * Fixed Chat API Route dengan Dynamic Params Handling
 * Memperbaiki issue params.chatId yang harus di-await
 */

import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../../lib/storage/memory';

/**
 * GET /api/chat/[chatId] - Get specific chat dengan messages
 * ✅ FIXED: params harus di-await sebelum digunakan
 */
export async function GET(request, { params }) {
  try {
    // ✅ FIXED: Await params sebelum digunakan
    const { chatId } = await params;

    // Validasi chatId
    if (!chatId || chatId === 'undefined' || chatId === 'null') {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 }
      );
    }

    console.log(`📖 Fetching chat with ID: ${chatId}`);

    const chat = await memoryStorage.getChatById(chatId);

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: chat,
    });
    
  } catch (error) {
    console.error(`GET /api/chat/[chatId] error:`, error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch chat',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/[chatId] - Delete chat
 * ✅ FIXED: params harus di-await sebelum digunakan
 */
export async function DELETE(request, { params }) {
  try {
    // ✅ FIXED: Await params sebelum digunakan
    const { chatId } = await params;

    // Validasi chatId
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