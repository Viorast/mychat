"use server"; // Menjamin eksekusi server-side

import { NextResponse } from 'next/server';
import { databaseStorage } from '../../../../../lib/storage/database';
// Impor statis sekarang aman karena file ini hanya menangani POST
import { ragLayer } from '../../../../../lib/rag/ragLayer';
import { handleStreamingResponse } from '../../../../../lib/ai/stream';

/**
 * POST /api/chat/[chatId]/message - Mengirim pesan ke chat
 */
export async function POST(request, context) {
  // `context.params` may be a promise — await before using
  const { chatId } = await context.params;

  try {
    const body = await request.json();
    const {
      message, // Ini adalah konten teks
      image,   // Ini objek gambar { base64, mimeType }
      userId = '00000000-0000-0000-0000-000000000001' // Default user UUID
    } = body;

    if (!chatId) {
      return NextResponse.json({ success: false, error: 'Chat ID is required' }, { status: 400 });
    }

    // Panggil helper yang sekarang kita pindahkan ke sini
    return await handleChatMessage(
      message || '',
      chatId,
      userId,
      image,
      ragLayer, // <== Kirim modul yang diimpor
      handleStreamingResponse // <== Kirim modul yang diimpor
    );

  } catch (error) {
    console.error(`POST /api/chat/${chatId}/message error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process message request',
        details: error.message
      },
      { status: 500 }
    );
  }
}


/**
 * Handle chat message processing (Dipindahkan dari /api/chat/route.js)
 */
async function handleChatMessage(message, chatId, userId, image = null, ragLayer, handleStreamingResponse) {
  // Helper (ini aman, tidak memiliki dependensi Node.js)
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

    console.log(`[API /message] Processing RAG for chatId: ${chatId}, message: "${trimmedMessage.substring(0, 50)}...", hasImage: ${!!image}`);

    // 1. Simpan pesan pengguna
    // Construct Data URI if image exists
    const imageDataUrl = image
      ? `data:${image.mimeType};base64,${image.base64}`
      : null;

    await databaseStorage.addMessageToChat(chatId, {
      role: 'user',
      content: trimmedMessage,
      imageUrl: imageDataUrl, // Gunakan key 'imageUrl' dan simpan string lengkap
      timestamp: new Date()
    });

    // 2. (Opsional) Update judul chat
    try {
      const currentChat = await databaseStorage.getChatById(chatId);
      if (currentChat && (currentChat.title === 'New Chat' || currentChat.title === 'New Chat...')) {
        const newTitle = trimmedMessage ? trimmedMessage.substring(0, 30) + '...' : 'Chat with Image';
        await databaseStorage.updateChat(chatId, { title: newTitle });
        console.log(`[API /message] Chat title updated to: "${newTitle}"`);
      }
    } catch (titleError) {
      console.warn("[API /message] Failed to update chat title:", titleError.message);
    }

    // 3. Dapatkan riwayat percakapan - ✅ OPTIMIZED: Limit to 6 messages (3 user + 3 AI)
    const history = (await databaseStorage.getMessagesByChat(chatId)).slice(-7, -1); // Get last 6 messages (excluding current)
    console.log(`[API /message] Using ${history.length} previous messages as history context (optimized limit).`);

    // 4. Proses query menggunakan RAG Layer
    const ragResult = await ragLayer.processQuery(trimmedMessage, history, image);

    // 5. Handle hasil stream
    if (ragResult && ragResult.success && ragResult.stream) {
      console.log('[API /message] RAG processing successful, streaming response...');

      const assistantMessagePlaceholder = await databaseStorage.addMessageToChat(chatId, {
        role: 'assistant',
        content: '[Sedang memproses...]', // Placeholder
        timestamp: new Date(),
        isStreaming: true,
        isError: ragResult.isError || false
      });

      if (!assistantMessagePlaceholder) {
        console.error(`[API /message] Gagal membuat pesan placeholder untuk chat ID: ${chatId}.`);
        return createStreamFromText("Gagal menyimpan pesan placeholder.", true);
      }

      return handleStreamingResponse(
        ragResult,
        chatId,
        assistantMessagePlaceholder.id
      );

    } else {
      const errMsg = ragResult?.error || "Terjadi kesalahan tidak dikenal saat memproses permintaan RAG.";
      console.error('[API /message] RAG processQuery returned invalid or failed result:', ragResult);
      await databaseStorage.addMessageToChat(chatId, { role: 'assistant', content: errMsg, isError: true, timestamp: new Date() });
      return createStreamFromText(errMsg, true);
    }

  } catch (error) {
    console.error('[API /message] Critical error in handleChatMessage:', error);
    const criticalErrorMsg = "Maaf, terjadi kesalahan sistem yang tidak terduga. Silakan coba lagi nanti.";
    try {
      await databaseStorage.addMessageToChat(chatId || 'unknown_chat_error', { role: 'assistant', content: criticalErrorMsg, isError: true, timestamp: new Date() });
    } catch (storageError) {
      console.error("[API /message] Failed to save critical error message to storage:", storageError);
    }
    return createStreamFromText(criticalErrorMsg, true);
  }
}