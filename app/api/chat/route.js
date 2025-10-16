// app/api/chat/route.js - COMPATIBLE VERSION
import { NextResponse } from 'next/server';
import { memoryStorage } from '../../../lib/storage/memory';
import { schemaService } from '../../../lib/database/schemaService';
import { queryService } from '../../../lib/gemini/queryService';
import { queryExecutor } from '../../../lib/database/queryExecutor';

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
 * Handle chat message processing (n8n workflow simulation)
 */
async function handleChatMessage(message, chatId, userId) {
  try {
    console.log('🔍 Processing user query:', message);

    // Step 1: Get Schema
    const schema = await schemaService.getFullSchema();
    console.log('📊 Schema loaded');

    // Step 2: Generate SQL Query dengan AI
    const aiResponse = await queryService.generateSQLQuery(message, schema);
    console.log('🤖 AI Response:', aiResponse);

    let finalResponse = aiResponse.message;
    let queryResults = [];
    let executedQuery = null;

    // Step 3: Execute Query jika diperlukan
    if (aiResponse.needs_query_execution && aiResponse.query) {
      try {
        // Validate query terlebih dahulu
        const validation = queryExecutor.validateQuery(aiResponse.query);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Execute query
        const result = await queryExecutor.executeQuery(aiResponse.query);
        executedQuery = aiResponse.query;
        
        if (!result.success) {
          throw new Error(result.error);
        }

        queryResults = result.rows;
        console.log('📈 Query executed, results:', queryResults.length);

        // Step 4: AI Analysis jika diperlukan
        if (aiResponse.needs_ai_analysis && queryResults.length > 0) {
          finalResponse = await queryService.analyzeQueryResults(
            message, 
            queryResults, 
            aiResponse.text_template
          );
        } else if (queryResults.length > 0) {
          // Simple template replacement untuk direct responses
          finalResponse = queryService.generateFallbackAnalysis(
            queryResults, 
            aiResponse.text_template || aiResponse.message
          );
        } else {
          finalResponse = 'Tidak ada data yang ditemukan dengan kriteria tersebut.';
        }
      } catch (queryError) {
        console.error('Query execution error:', queryError);
        finalResponse = `Maaf, terjadi kesalahan saat mengambil data: ${queryError.message}`;
        
        // Fallback ke message asli dari AI jika query gagal
        if (aiResponse.message && aiResponse.message !== finalResponse) {
          finalResponse = aiResponse.message;
        }
      }
    }

    // Simpan message ke storage
    const chatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: finalResponse,
      timestamp: new Date(),
      metadata: {
        query: executedQuery,
        results_count: queryResults.length,
        needs_analysis: aiResponse.needs_ai_analysis
      }
    };

    // Simpan messages ke chat
    if (chatId) {
      await memoryStorage.addMessageToChat(chatId, chatMessage);
      await memoryStorage.addMessageToChat(chatId, assistantMessage);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: finalResponse,
        query: executedQuery,
        results_count: queryResults.length,
        needs_analysis: aiResponse.needs_ai_analysis,
        status: aiResponse.status
      },
      message: 'Message processed successfully',
    });

  } catch (error) {
    console.error('Chat message processing error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process message',
        message: 'Maaf, terjadi kesalahan sistem. Silakan coba lagi.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/chat/[chatId] - Update chat title
 */
export async function PUT(request, { params }) {
  try {
    const { chatId } = params;
    const body = await request.json();
    const { title } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'Chat title is required' },
        { status: 400 }
      );
    }

    const updatedChat = await memoryStorage.updateChat(chatId, {
      title: title.trim(),
    });

    if (!updatedChat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedChat,
      message: 'Chat title updated successfully',
    });
    
  } catch (error) {
    console.error(`PUT /api/chat/${params.chatId} error:`, error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update chat',
        details: error.message 
      },
      { status: 500 }
    );
  }
}