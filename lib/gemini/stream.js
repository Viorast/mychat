/**
 * Enhanced Streaming Handler untuk Real AI Responses
 * Mendukung real-time streaming dengan Gemini API
 */

/**
 * Create enhanced readable stream dengan better chunk handling
 */
export function createReadableStream(geminiStream) {
  let isStreaming = true;
  
  return new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        
        // Send initial signal
        const startData = JSON.stringify({
          type: 'start',
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${startData}\n\n`));
        
        // Process stream chunks
        for await (const chunk of geminiStream) {
          if (!isStreaming) break;
          
          const text = chunk.text();
          if (text && text.trim()) {
            const data = JSON.stringify({
              type: 'chunk',
              content: text,
              timestamp: new Date().toISOString(),
            });
            
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // Send completion signal
        if (isStreaming) {
          const completionData = JSON.stringify({
            type: 'complete',
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${completionData}\n\n`));
        }
        
        controller.close();
        
      } catch (error) {
        console.error('Stream error:', error);
        const errorData = JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    },
    
    cancel() {
      isStreaming = false;
      console.log('Stream cancelled by client');
    }
  });
}

/**
 * Handle streaming response dengan better error handling
 */
export async function handleStreamingResponse(geminiResult) {
  if (!geminiResult.success) {
    // Return error response
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const errorData = JSON.stringify({
          type: 'error',
          error: geminiResult.error,
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

  const readableStream = createReadableStream(geminiResult.stream);
  
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

/**
 * Process text stream untuk real-time display
 */
export class StreamProcessor {
  constructor() {
    this.buffer = '';
    this.completeText = '';
  }

  processChunk(chunk) {
    this.buffer += chunk;
    
    // Simple processing - you can add more sophisticated logic here
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
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