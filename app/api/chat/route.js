/**
 * Simplified Chat API Routes
 * Menggunakan in-memory storage
 */

import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../lib/storage/memory';

/**
 * GET /api/chat - Get user's chat list
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default-user';
    
    const chats = await memoryStorage.getChatsByUser(userId);
    
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
 * POST /api/chat - Create new chat
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { title = 'New Chat', userId = 'default-user' } = body;

    if (!title.trim()) {
      return NextResponse.json(
        { error: 'Chat title is required' },
        { status: 400 }
      );
    }

    const newChat = await memoryStorage.createChat({
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
        error: 'Failed to create chat',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/chat/[chatId] - Update chat title
 */
export async function PUT(request, { params }) {
  try {
    const { chatId } = params;
    const body = await request.json();
    const { title } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'Chat title is required' },
        { status: 400 }
      );
    }

    // ✅ FIXED: Update chat title di storage
    const updatedChat = await memoryStorage.updateChat(chatId, {
      title: title.trim(),
    });

    if (!updatedChat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedChat,
      message: 'Chat title updated successfully',
    });
    
  } catch (error) {
    console.error(`PUT /api/chat/${params.chatId} error:`, error);
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