import { memoryStorage } from "../storage/memory";

/**
 * ✅ MODIFIKASI: Menerima 'responsePromise' dan 'totalThoughtTokens'
 */
export function createReadableStream(geminiStream, chatId, messageIdToUpdate, responsePromise, totalThoughtTokens) {
  let isStreaming = true;
  let aggregatedText = '';
  let finalUsage = null; 

  // Fungsi helper untuk logging dan update
  const finalizeStream = async (isError = false) => {
    try {
      const finalResponse = await responsePromise.catch(e => {
        console.warn("[Stream] responsePromise gagal:", e.message);
        return null; 
      });

      if (finalResponse && finalResponse.usageMetadata) {
        finalUsage = finalResponse.usageMetadata;
        console.log(`[RAG Tokens] Final Generation Usage (Chat: ${chatId}): ${JSON.stringify(finalUsage)}`);
      } else {
        console.warn(`[Stream] Tidak mendapatkan usageMetadata untuk chat ${chatId}.`);
      }

      // ✅ Gabungkan semua token
      const finalTokenUsage = {
          thoughtTokens: totalThoughtTokens || 0,
          promptTokens: finalUsage?.promptTokenCount || 0,
          candidatesTokens: finalUsage?.candidatesTokenCount || 0,
          totalTokens: (totalThoughtTokens || 0) + (finalUsage?.totalTokenCount || 0)
      };
      console.log(`[RAG Tokens] Total Usage (Chat: ${chatId}): ${JSON.stringify(finalTokenUsage)}`);

      if (chatId && messageIdToUpdate) {
        console.log(`[Stream] Menyimpan konten final ke memori untuk pesan ${messageIdToUpdate}.`);
        await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
          content: aggregatedText || (isError ? "Error processing stream" : "Response complete"),
          isStreaming: false,
          isError: isError,
          tokenUsage: finalTokenUsage // ✅ Simpan objek token yang baru
        });
      }
    } catch (e) {
      console.error(`[Stream] Gagal memfinalisasi stream untuk ${messageIdToUpdate}:`, e);
    }
  };

  return new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', timestamp: new Date().toISOString() })}\n\n`));

        for await (const chunk of geminiStream) {
          if (!isStreaming) break;

          const text = chunk.text?.() || '';
          if (text) { 
            aggregatedText += text;
            const data = JSON.stringify({
              type: 'chunk',
              content: text,
              timestamp: new Date().toISOString(),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        if (isStreaming) {
          const completionData = JSON.stringify({
            type: 'complete',
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${completionData}\n\n`));
        }

        controller.close();
        await finalizeStream(false); // Finalisasi sukses

      } catch (error) {
        console.error('Stream error:', error);
        const encoder = new TextEncoder();
        const errorData = JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        
        aggregatedText = `Maaf, terjadi kesalahan stream: ${error.message}`;
        await finalizeStream(true); // Finalisasi error
        
        controller.close();
      }
    },

    async cancel() {
      isStreaming = false;
      console.log('Stream cancelled by client');
      aggregatedText += " (Stream dibatalkan)";
      await finalizeStream(true); // Finalisasi (dianggap error/batal)
    }
  });
}

/**
 * ✅ MODIFIKASI: Menerima 'geminiResult' penuh
 */
export async function handleStreamingResponse(geminiResult, chatId, messageIdToUpdate) {
  if (!geminiResult.success) {
    // ... (Logika error stream lama tetap sama) ...
    try {
      if (chatId && messageIdToUpdate) {
        await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
          content: geminiResult.error || "Gagal memproses permintaan RAG sebelum stream.",
          isStreaming: false,
          isError: true,
          tokenUsage: { totalTokens: 0 } // Simpan token 0
        });
      }
    } catch (e) {
      console.error("Gagal menyimpan RAG error ke memori:", e);
    }
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const errorData = JSON.stringify({
          type: 'error',
          error: geminiResult.error || "Unknown RAG Error",
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    });
    return new Response(errorStream, {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  // ✅ Teruskan semua properti dari 'geminiResult'
  const readableStream = createReadableStream(
    geminiResult.stream,
    chatId,
    messageIdToUpdate,
    geminiResult.responsePromise, // <==
    geminiResult.totalThoughtTokens // <== Parameter baru
  );

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ... (StreamProcessor class tetap sama) ...
export class StreamProcessor {
  constructor() {
    this.buffer = '';
    this.completeText = '';
  }
  processChunk(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    const completeLines = lines.filter(line => line.trim());
    completeLines.forEach(line => {
      try {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'chunk') {
            this.completeText += data.content;
          }
        }
      } catch (e) {
        console.warn('Failed to parse stream line:', line);
      }
    });
    return this.completeText;
  }
  getCompleteText() { return this.completeText; }
  reset() { this.buffer = ''; this.completeText = ''; }
}