import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../../lib/storage/memory';
import { geminiClient } from '../../../../lib/gemini/client';

export async function POST(request) {
  let chatId = 'default-chat';

  try {
    const { message, chatId: requestChatId, updateTitle = false } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    chatId = requestChatId || chatId;
    console.log('Processing stream request:', { message: message.substring(0, 50), chatId, updateTitle });

    // Simpan pesan user ke storage
    const userMessage = await memoryStorage.addMessageToChat(chatId, {
      content: message.trim(),
      role: 'user',
      timestamp: new Date()
    });

    console.log('User message saved:', userMessage.id);

    const aiResponse = await geminiClient.generateResponse(message.trim());

    if (!aiResponse.success) {
      throw new Error('Failed to generate AI response');
    }

    const assistantContent = aiResponse.text;

    // Simpan response AI ke storage
    const assistantMessage = await memoryStorage.addMessageToChat(chatId, {
      content: assistantContent,
      role: 'assistant',
      timestamp: new Date(),
      isStreamed: false
    });

    console.log('Assistant message saved:', assistantMessage.id);

    let updatedChat = null;
    if (updateTitle) {
      try {
        const currentChat = await memoryStorage.getChatById(chatId);
        if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
          const newTitle = message.trim().substring(0, 30) + (message.length > 30 ? '...' : '');
          updatedChat = await memoryStorage.updateChat(chatId, {
            title: newTitle
          });
          console.log('Chat title updated:', newTitle);
        }
      } catch (titleError) {
        console.warn('⚠️ Failed to update chat title:', titleError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        assistantMessage: {
          id: assistantMessage.id,
          content: assistantContent,
          role: 'assistant',
          timestamp: assistantMessage.timestamp,
          chatId: chatId
        },
        userMessage: {
          id: userMessage.id,
          content: message.trim(),
          role: 'user',
          timestamp: userMessage.timestamp,
          chatId: chatId
        },
        updatedChat: updatedChat
      },
      message: 'Message processed successfully'
    });

  } catch (error) {
    console.error('Gemini stream error:', error);

    // Fallback response
    const fallbackResponse = "Maaf, terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.";

    try {
      await memoryStorage.addMessageToChat(chatId, {
        content: fallbackResponse,
        role: 'assistant',
        timestamp: new Date(),
        isError: true
      });
    } catch (storageError) {
      console.error('Failed to save error message:', storageError);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Stream processing failed',
        message: fallbackResponse,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// GET endpoint untuk testing
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId') || 'default-chat';

    const messages = await memoryStorage.getMessagesByChat(chatId);

    return NextResponse.json({
      success: true,
      data: messages,
      count: messages.length,
    });

  } catch (error) {
    console.error('GET /api/gemini/stream error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch messages',
        details: error.message
      },
      { status: 500 }
    );
  }
}