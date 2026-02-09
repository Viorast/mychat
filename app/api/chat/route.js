import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../lib/storage/database';


// ⛔ HAPUS SEMUA impor 'ragLayer' dan 'handleStreamingResponse'
// Hapus juga 'handleChatMessage'

/**
 * GET /api/chat - Get user's chat list
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '00000000-0000-0000-0000-000000000001';

    const chats = await databaseStorage.getChatsByUser(userId);

    return NextResponse.json({
      success: true,
      data: chats,
      count: chats.length,
    });

  } catch (error) {
    console.error('GET /api/chat error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch chats',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat - HANYA UNTUK MEMBUAT CHAT BARU
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      title,
      userId = '00000000-0000-0000-0000-000000000001'
      // ⛔ HAPUS 'message', 'image', dan 'chatId' dari sini
    } = body;

    // ⛔ HAPUS: Seluruh blok 'if (message || image)'

    // Logika untuk membuat chat baru
    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'Chat title is required' },
        { status: 400 }
      );
    }

    const newChat = await databaseStorage.createChat({
      title: title.trim(),
      userId,
    });

    return NextResponse.json({
      success: true,
      data: newChat,
      message: 'Chat created successfully',
    }, { status: 201 });

  } catch (error) {
    console.error('POST /api/chat error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process request',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// ⛔ HAPUS: Seluruh fungsi 'handleChatMessage' dari file ini