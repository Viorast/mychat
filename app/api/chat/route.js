import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../lib/storage/memory';
import { schemaService } from '../../../lib/database/schemaService';
import { queryService } from '../../../lib/gemini/queryService';
import { queryExecutor } from '../../../lib/database/queryExecutor';
import { geminiClient } from '../../../lib/gemini/client';
import { handleStreamingResponse } from '../../../lib/gemini/stream';

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
 * POST /api/chat - Create new chat OR send message to existing chat
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

    if (message) {
      return await handleChatMessage(message, chatId, userId);
    }

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
 * Handle chat message processing with CONVERSATION HISTORY and DYNAMIC CONTEXT
 */
async function handleChatMessage(message, chatId, userId) { 
  const createStreamFromText = (text) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  };

  try {
    console.log(' Processing user query:', message);

    await memoryStorage.addMessageToChat(chatId, { role: 'user', content: message });

    const currentChat = await memoryStorage.getChatById(chatId);
    if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
        const newTitle = message.trim().substring(0, 30) + (message.length > 30 ? '...' : '');
        await memoryStorage.updateChat(chatId, { title: newTitle });
    }

    const history = (await memoryStorage.getMessagesByChat(chatId)).slice(-11, -1); // Ambil 10 pesan terakhir sebelum pesan baru
    console.log(`Found ${history.length} messages in history.`);
    
    const schema = await schemaService.getFullSchema();
    
    const additionalContext = await queryService.getAdditionalContext(schema);
    console.log('Fetched additional context (row counts, sample data).');

    const aiResponse = await queryService.generateSQLQuery(message, schema, history, additionalContext);
    console.log('AI Response (SQL Gen):', aiResponse);

    if (aiResponse.needs_query_execution && aiResponse.query) {
      let result;
      try {
        const validation = queryExecutor.validateQuery(aiResponse.query);
        if (!validation.valid) throw new Error(validation.error);
        
        result = await queryExecutor.executeQuery(aiResponse.query);
        if (!result.success) throw new Error(result.error);

      } catch (dbError) {
        console.error('Database Execution Error:', dbError.message);
        const userFriendlyError = "Maaf, saya mengalami sedikit kendala saat mencoba mengambil data. Mungkin informasi yang Anda minta tidak tersedia atau ada kesalahan internal. Silakan coba pertanyaan lain.";
        await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: userFriendlyError, isError: true });
        return createStreamFromText(userFriendlyError);
      }
      
      let finalPromptForStreaming;
      let fullResponseForStorage = "";

      if (result.rows.length > 0) {
        finalPromptForStreaming = `Berdasarkan pertanyaan "${message}", dan data berikut:\n${JSON.stringify(result.rows, null, 2)}\n\nBerikan jawaban dalam bahasa natural yang mudah dimengerti.`;
        fullResponseForStorage = await queryService.analyzeQueryResults(message, result.rows, aiResponse.text_template);
      } else {
        fullResponseForStorage = 'Tidak ada data yang ditemukan dengan kriteria tersebut.';
        finalPromptForStreaming = `Jawab dengan sopan bahwa tidak ada data yang ditemukan untuk pertanyaan: "${message}"`;
      }
      
      await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: fullResponseForStorage });
      const geminiResult = await geminiClient.generateStream(finalPromptForStreaming);
      return handleStreamingResponse(geminiResult);

    } else {
      const finalMessage = aiResponse.message;
      await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: finalMessage });
      return createStreamFromText(finalMessage);
    }
  } catch (error) {
    console.error('Critical Chat message processing error:', error);
    const criticalErrorMsg = "Maaf, terjadi kesalahan tak terduga di sistem. Tim kami sudah diberitahu. Silakan coba lagi nanti.";
    await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: criticalErrorMsg, isError: true });
    return createStreamFromText(criticalErrorMsg);
  }
}