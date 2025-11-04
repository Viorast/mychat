import { memoryStorage } from "../storage/memory";

export function createReadableStream(geminiStream, chatId, messageIdToUpdate) {
  let isStreaming = true;
  let aggregatedText = '';

  return new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();

        const startData = JSON.stringify({
          type: 'start',
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${startData}\n\n`));

        for await (const chunk of geminiStream) {
          if (!isStreaming) break;

          const text = chunk.text?.() || '';
          if (text.trim()) {
            aggregatedText += text; // simpan semua isi yang sudah diterima

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

          // ✅ Simpan hasil akhir ke memoryStorage
          if (chatId && messageIdToUpdate) {
            console.log(`[Stream] Stream selesai. Menyimpan konten final ke memori untuk pesan ${messageIdToUpdate}.`);
            await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
              content: aggregatedText,
              isStreaming: false,
              isError: false
            });
          }
        }

        controller.close();

      } catch (error) {
        console.error('Stream error:', error);
        const encoder = new TextEncoder();
        const errorData = JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));

        if (chatId && messageIdToUpdate) {
          console.log(`[Stream] Stream error. Menyimpan error ke memori untuk pesan ${messageIdToUpdate}.`);
          await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
            content: `Maaf, terjadi kesalahan stream: ${error.message}`,
            isStreaming: false,
            isError: true
          });
        }

        controller.close();
      }
    },

    async cancel() {
      isStreaming = false;
      console.log('Stream cancelled by client');

      // ✅ Simpan konten parsial jika dibatalkan
      if (chatId && messageIdToUpdate && aggregatedText) {
        console.log(`[Stream] Dibatalkan. Menyimpan konten parsial ke memori untuk pesan ${messageIdToUpdate}.`);
        await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
          content: aggregatedText + " (Stream dibatalkan)",
          isStreaming: false,
          isError: true
        });
      }
    }
  });
}

export async function handleStreamingResponse(geminiResult, chatId, messageIdToUpdate) {
  // ✅ Tambahkan parameter chatId & messageIdToUpdate
  if (!geminiResult.success) {
    try {
      if (chatId && messageIdToUpdate) {
        console.log(`[HandleStream] RAG gagal. Menyimpan error ke memori untuk pesan ${messageIdToUpdate}.`);
        await memoryStorage.updateMessage(chatId, messageIdToUpdate, {
          content: geminiResult.error || "Gagal memproses permintaan RAG sebelum stream.",
          isStreaming: false,
          isError: true
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
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // ✅ Pastikan parameter diteruskan ke fungsi di bawah
  const readableStream = createReadableStream(
    geminiResult.stream,
    chatId,
    messageIdToUpdate
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

  getCompleteText() {
    return this.completeText;
  }

  reset() {
    this.buffer = '';
    this.completeText = '';
  }
}
