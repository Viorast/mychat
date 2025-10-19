import { NextResponse } from 'next/server';
import { mcpTools } from '../../../lib/mcp/tools';

export async function POST(request) {
  try {
    const { toolName, input } = await request.json();

    if (!toolName || !mcpTools[toolName]) {
      return NextResponse.json({ error: `Tool "${toolName}" not found.` }, { status: 404 });
    }

    const tool = mcpTools[toolName];

    const parsedInput = tool.input.safeParse(input);
    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input for tool.', details: parsedInput.error.format() }, { status: 400 });
    }

    const result = await tool.handler(parsedInput.data);

    return NextResponse.json({ result });

  } catch (error) {
    console.error(`MCP Server Error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute tool', details: error.message },
      { status: 500 }
    );
  }
}