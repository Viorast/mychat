/**
 * Enhanced Gemini API Route dengan Real AI Responses
 * Mendukung streaming dan non-streaming responses
 */

import { NextResponse } from 'next/server';
import { geminiClient } from '../../../../lib/gemini/client';
import { handleStreamingResponse } from '../../../../lib/gemini/stream';
import { memoryStorage } from '../../../../lib/storage/memory';

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, chatId, updateTitle = false, stream = false } = body;

    // Validasi input
    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Pesan tidak boleh kosong' },
        { status: 400 }
      );
    }

    if (!geminiClient) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Gemini AI tidak tersedia. Periksa GEMINI_API_KEY di file .env' 
        },
        { status: 500 }
      );
    }

    console.log(`💬 Processing message for chat ${chatId}:`, message.substring(0, 100) + '...');

    // ✅ Auto-generate chat title jika diperlukan
    if (updateTitle) {
      const chat = await memoryStorage.getChatById(chatId);
      if (chat && (chat.title === 'New Chat' || chat.title === 'New Chat...')) {
        const newTitle = message.length > 30 ? message.substring(0, 30) + '...' : message;
        await memoryStorage.updateChat(chatId, { title: newTitle });
        console.log(`📝 Updated chat title to: ${newTitle}`);
      }
    }

    // Simpan pesan user ke storage
    const userMessage = await memoryStorage.addMessage(chatId, {
      content: message.trim(),
      role: 'user'
    });

    console.log('✅ User message saved');

    // Handle streaming request
    if (stream) {
      console.log('🌊 Starting streaming response...');
      
      const streamResult = await geminiClient.generateStream(message);
      
      if (!streamResult.success) {
        throw new Error(streamResult.error || 'Streaming failed');
      }

      // Simpan AI message setelah streaming selesai (akan dihandle di frontend)
      return await handleStreamingResponse(streamResult);
    }

    // Handle non-streaming request (default)
    console.log('🤖 Generating AI response...');
    const aiResponse = await geminiClient.generateResponse(message);
    
    if (!aiResponse.success) {
      console.error('❌ AI response failed:', aiResponse.error);
      throw new Error(aiResponse.error || 'AI response failed');
    }

    console.log('✅ AI response generated:', aiResponse.text.substring(0, 100) + '...');

    // Simpan pesan AI ke storage
    const assistantMessage = await memoryStorage.addMessage(chatId, {
      content: aiResponse.text,
      role: 'assistant'
    });

    console.log('✅ Assistant message saved');

    return NextResponse.json({
      success: true,
      data: {
        userMessage,
        assistantMessage,
        usage: aiResponse.usage
      },
      isDemo: false,
      message: 'Response generated successfully'
    });

  } catch (error) {
    console.error('❌ Gemini API error:', error);
    
    // Fallback response
    const fallbackResponse = {
      success: false,
      error: error.message,
      data: {
        userMessage: null,
        assistantMessage: {
          id: `ai-${Date.now()}`,
          content: 'Maaf, saya mengalami kendala sementara. Silakan coba lagi dalam beberapa saat.',
          role: 'assistant',
          timestamp: new Date().toISOString(),
          isError: true
        }
      },
      isDemo: false
    };
    
    return NextResponse.json(fallbackResponse, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  if (!geminiClient) {
    return NextResponse.json({
      status: 'error',
      message: 'Gemini client not initialized. Check GEMINI_API_KEY.'
    }, { status: 500 });
  }

  const testResult = await geminiClient.testConnection();
  
  return NextResponse.json({
    status: testResult.connected ? 'healthy' : 'error',
    connected: testResult.connected,
    message: testResult.connected ? 'Gemini AI is connected and working' : testResult.error,
    timestamp: new Date().toISOString()
  });
}

// Support CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}