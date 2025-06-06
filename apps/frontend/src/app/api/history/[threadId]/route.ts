import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params

  // Placeholder response - will be implemented in Task 1.5
  console.log('History request for threadId:', threadId)
  
  return NextResponse.json({ 
    messages: [],
    message: 'History endpoint placeholder - will be implemented in Task 1.5'
  })
} 