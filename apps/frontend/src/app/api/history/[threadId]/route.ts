import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await context.params

  // Placeholder response - will be implemented in Task 1.5
  console.log('History request for threadId:', threadId)
  
  return NextResponse.json({ 
    messages: [],
    message: 'History endpoint placeholder - will be implemented in Task 1.5'
  })
} 