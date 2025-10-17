import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../lib/storage/memory';
import { schemaService } from '../../../lib/database/schemaService';
import { queryService } from '../../../lib/gemini/queryService';
import { queryExecutor } from '../../../lib/database/queryExecutor';
import { geminiClient } from '../../../lib/gemini/client';
import { handleStreamingResponse } from '../../../lib/gemini/stream';

/**
 * GET /api/chat - Get user's chat list
 * FIXED: Mengembalikan fungsi GET yang hilang
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
 * POST /api/chat - Create new chat OR send message to existing chat
 * FIXED: Mengembalikan fungsi POST yang hilang
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      title, 
      userId = 'default-user', 
      message, 
      chatId 
    } = body;

    // Jika ada message, proses sebagai chat message
    if (message) {
      return await handleChatMessage(message, chatId, userId);
    }

    // Jika tidak ada message, proses sebagai chat creation
    if (!title?.trim()) {
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
        error: 'Failed to process request',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * Handle chat message processing (n8n workflow simulation) with STREAMING
 * Ini adalah fungsi helper, tidak diekspor
 */
async function handleChatMessage(message, chatId, userId) {
  try {
    console.log('💬 Processing user query:', message);

    // Step 1: Simpan pesan pengguna
    await memoryStorage.addMessageToChat(chatId, { role: 'user', content: message });

    // Step 2: Auto-update judul jika ini pesan pertama
    const currentChat = await memoryStorage.getChatById(chatId);
    if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
        const newTitle = message.trim().substring(0, 30) + (message.length > 30 ? '...' : '');
        await memoryStorage.updateChat(chatId, { title: newTitle });
    }

    // Step 3: Dapatkan Skema Database
    const schema = await schemaService.getFullSchema();
    console.log('🔍 Schema loaded');

    // Step 4: Generate SQL Query dengan AI (tidak streaming)
    const aiResponse = await queryService.generateSQLQuery(message, schema);
    console.log('🤖 AI Response (SQL Gen):', aiResponse);

    let finalPromptForStreaming;
    let fullResponseForStorage = "";

    // Step 5: Eksekusi Query jika diperlukan
    if (aiResponse.needs_query_execution && aiResponse.query) {
      const validation = queryExecutor.validateQuery(aiResponse.query);
      if (!validation.valid) throw new Error(validation.error);

      const result = await queryExecutor.executeQuery(aiResponse.query);
      if (!result.success) throw new Error(result.error);

      if (result.rows.length > 0) {
        finalPromptForStreaming = `Berdasarkan pertanyaan "${message}", dan data berikut:\n${JSON.stringify(result.rows, null, 2)}\n\nBerikan jawaban dalam bahasa natural.`;
        fullResponseForStorage = await queryService.analyzeQueryResults(message, result.rows, aiResponse.text_template);
      } else {
        fullResponseForStorage = 'Tidak ada data yang ditemukan dengan kriteria tersebut.';
        finalPromptForStreaming = `Jawab dengan sopan bahwa tidak ada data yang ditemukan untuk pertanyaan: "${message}"`;
      }
    } else {
      fullResponseForStorage = aiResponse.message;
      finalPromptForStreaming = fullResponseForStorage; // Langsung stream pesan dari AI jika tidak ada query
    }

    // Step 6: Simpan respons AI lengkap ke storage
    await memoryStorage.addMessageToChat(chatId, {
      role: 'assistant',
      content: fullResponseForStorage,
    });
    
    // Step 7: Lakukan streaming jawaban ke client
    const geminiResult = await geminiClient.generateStream(finalPromptForStreaming);
    return handleStreamingResponse(geminiResult);

  } catch (error) {
    console.error('Chat message processing error:', error);
    // Kirim respons error streaming
    const errorStreamResult = { success: false, error: `Maaf, terjadi kesalahan: ${error.message}` };
    return handleStreamingResponse(errorStreamResult);
  }
}