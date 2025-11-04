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
      message, // Ini adalah konten teks
      image,   // Ini objek gambar { base64, mimeType }
      chatId
    } = body;

    // Logika untuk mengirim pesan (teks atau gambar)
    if (message || image) { // Kirim jika ada teks ATAU gambar
      if (!chatId) {
        return NextResponse.json({ success: false, error: 'Chat ID is required to send a message' }, { status: 400 });
      }
      // Teruskan teks dan gambar ke handler
      return await handleChatMessage(message || '', chatId, userId, image); // Kirim string kosong jika message null/undefined
    }

    // Logika untuk membuat chat baru (jika tidak ada message/image)
    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'Chat title is required' },
        { status: 400 }
      );
    }
    // ... (sisa logika create chat tetap sama) ...
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
    // ... (error handling tetap sama) ...
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
async function handleChatMessage(message, chatId, userId, image = null) {
  const createStreamFromText = (text, isError = false) => {
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', timestamp: new Date().toISOString() })}\n\n`));
                if (text && text.trim()) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: text, timestamp: new Date().toISOString() })}\n\n`));
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', isError: isError, timestamp: new Date().toISOString() })}\n\n`));
                controller.close();
            } catch (e) {
                console.error("Error in fallback stream:", e);
                controller.error(e);
            }
        }
    });
    const status = isError ? 500 : 200;
    return new Response(stream, {
        status: status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  };
  // Akhir helper

  try {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !image) {
        return createStreamFromText("Pesan atau gambar tidak boleh kosong.", true);
    }

    console.log(`[API] Processing RAG for chatId: ${chatId}, message: "${trimmedMessage.substring(0, 50)}...", hasImage: ${!!image}`);

    // 1. Simpan pesan pengguna
    await memoryStorage.addMessageToChat(chatId, {
        role: 'user',
        content: trimmedMessage,
        image: image ? { mimeType: image.mimeType, hasImageData: true } : null,
        timestamp: new Date()
    });

    // 2. (Opsional) Update judul chat
    try {
        const currentChat = await memoryStorage.getChatById(chatId);
        if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
            const newTitle = trimmedMessage ? trimmedMessage.substring(0, 30) + '...' : 'Chat with Image';
            await memoryStorage.updateChat(chatId, { title: newTitle });
            console.log(`[API] Chat title updated to: "${newTitle}"`);
        }
    } catch (titleError) {
        console.warn("[API] Failed to update chat title:", titleError.message);
    }


    // 3. Dapatkan riwayat percakapan
    const history = (await memoryStorage.getMessagesByChat(chatId)).slice(-11, -1);
    console.log(`[API] Using ${history.length} previous messages as history context.`);

    // 4. Proses query menggunakan RAG Layer
    const ragResult = await ragLayer.processQuery(trimmedMessage, history, image);

    // 5. Handle hasil stream
    if (ragResult && ragResult.success && ragResult.stream) {
        console.log('[API] RAG processing successful, streaming response...');

        // --- BUAT PLACEHOLDER DAN DAPATKAN ID-NYA ---
        const assistantMessagePlaceholder = await memoryStorage.addMessageToChat(chatId, {
             role: 'assistant',
             content: '[Sedang memproses...]', // Placeholder
             timestamp: new Date(),
             isStreaming: true,
             isError: ragResult.isError || false
        });

        if (!assistantMessagePlaceholder) {
            console.error(`[API] Gagal membuat pesan placeholder untuk chat ID: ${chatId}. Membatalkan stream.`);
             return createStreamFromText("Gagal menyimpan pesan placeholder.", true);
        }

        // --- TERUSKAN ID KE STREAM HANDLER ---
        // (Ini adalah baris ~178 tempat error terjadi)
        return handleStreamingResponse(
          ragResult,
          chatId, // Parameter ini sudah ada di scope handleChatMessage
          assistantMessagePlaceholder.id // ID dari placeholder yang baru dibuat
        );

    } else {
       // ... (Logika error fallback tetap sama) ...
       const errMsg = ragResult?.error || "Terjadi kesalahan tidak dikenal saat memproses permintaan RAG.";
       console.error('[API] RAG processQuery returned invalid or failed result:', ragResult);
       // Simpan error final ke memori
       await memoryStorage.addMessageToChat(chatId, { role: 'assistant', content: errMsg, isError: true, timestamp: new Date() });
       return createStreamFromText(errMsg, true);
    }


  } catch (error) {
    console.error('[API] Critical error in handleChatMessage:', error);
    const criticalErrorMsg = "Maaf, terjadi kesalahan sistem yang tidak terduga. Silakan coba lagi nanti.";
    try {
        await memoryStorage.addMessageToChat(chatId || 'unknown_chat_error', { role: 'assistant', content: criticalErrorMsg, isError: true, timestamp: new Date() });
    } catch (storageError) {
        console.error("[API] Failed to save critical error message to storage:", storageError);
    }
    return createStreamFromText(criticalErrorMsg, true);
  }
}