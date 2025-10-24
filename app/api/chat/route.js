import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../lib/storage/memory';
import { ragLayer } from '../../../lib/rag/ragLayer';
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
      // Pastikan chatId ada, jika tidak, mungkin perlu dibuat dulu atau ditolak
      if (!chatId) {
          return NextResponse.json({ success: false, error: 'Chat ID is required to send a message' }, { status: 400 });
      }
      return await handleChatMessage(message, chatId, userId); // Panggil handler baru
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
  // Helper untuk membuat stream teks sederhana (fallback)
  const createStreamFromText = (text, isError = false) => {
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const encoder = new TextEncoder();
                // Kirim event start
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', timestamp: new Date().toISOString() })}\n\n`));
                // Kirim event chunk dengan seluruh teks
                if (text && text.trim()) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: text, timestamp: new Date().toISOString() })}\n\n`));
                }
                // Kirim event complete
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', isError: isError, timestamp: new Date().toISOString() })}\n\n`));
                controller.close();
            } catch (e) {
                console.error("Error in fallback stream:", e);
                controller.error(e);
            }
        }
    });
    // Gunakan status 500 jika ini adalah stream error
    const status = isError ? 500 : 200;
    return new Response(stream, {
        status: status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  };

  try {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
        return createStreamFromText("Pesan tidak boleh kosong.", true);
    }

    console.log(`[API] Processing RAG for chatId: ${chatId}, message: "${trimmedMessage.substring(0, 50)}..."`);

    // 1. Simpan pesan pengguna
    await memoryStorage.addMessageToChat(chatId, { role: 'user', content: trimmedMessage, timestamp: new Date() });

    // 2. (Opsional) Update judul chat jika masih default
    try {
        const currentChat = await memoryStorage.getChatById(chatId);
        if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
            const newTitle = trimmedMessage.substring(0, 30) + (trimmedMessage.length > 30 ? '...' : '');
            await memoryStorage.updateChat(chatId, { title: newTitle });
            console.log(`[API] Chat title updated to: "${newTitle}"`);
        }
    } catch (titleError) {
        console.warn("[API] Failed to update chat title:", titleError.message);
        // Lanjutkan proses meskipun update judul gagal
    }


    // 3. Dapatkan riwayat percakapan (sebelum pesan baru)
    const history = (await memoryStorage.getMessagesByChat(chatId)).slice(-11, -1); // Ambil maks 10 pesan terakhir
    console.log(`[API] Using ${history.length} previous messages as history context.`);

    // 4. Proses query menggunakan RAG Layer
    const ragResult = await ragLayer.processQuery(trimmedMessage, history);

    // 5. Handle hasil dari RAG Layer (stream)
    if (ragResult && ragResult.success && ragResult.stream) {
        console.log('[API] RAG processing successful, streaming response...');

        // Simpan placeholder pesan AI di storage
        // Kita akan membutuhkan cara untuk mengupdate pesan ini setelah stream selesai
        // Mungkin perlu event 'final_content' dari stream atau mekanisme lain
        await memoryStorage.addMessageToChat(chatId, {
             role: 'assistant',
             content: '[Sedang memproses...]', // Placeholder awal
             timestamp: new Date(),
             isStreaming: true, // Tandai bahwa ini berasal dari stream
             isError: ragResult.isError || false // Tandai jika stream hasil dari error
        });

        // Kembalikan stream ke client menggunakan handleStreamingResponse
        return handleStreamingResponse(ragResult);

    } else {
       // Tangani kasus di mana ragResult tidak valid atau gagal (meskipun sudah ada fallback internal)
       const errMsg = ragResult?.error || "Terjadi kesalahan tidak dikenal saat memproses permintaan RAG.";
       console.error('[API] RAG processQuery returned invalid or failed result:', ragResult);
       await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: errMsg, isError: true, timestamp: new Date() });
       return createStreamFromText(errMsg, true);
    }

  } catch (error) {
    console.error('[API] Critical error in handleChatMessage:', error);
    const criticalErrorMsg = "Maaf, terjadi kesalahan sistem yang tidak terduga. Silakan coba lagi nanti.";
    try {
        // Coba simpan pesan error kritis ini
        await memoryStorage.addMessageToChat(chatId || 'unknown_chat', { role: 'assistant', content: criticalErrorMsg, isError: true, timestamp: new Date() });
    } catch (storageError) {
        console.error("[API] Failed to save critical error message to storage:", storageError);
    }
    // Kembalikan stream error ke client
    return createStreamFromText(criticalErrorMsg, true);
  }
}