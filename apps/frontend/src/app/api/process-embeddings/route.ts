import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    
    if (!backendUrl) {
      console.error('NEXT_PUBLIC_BACKEND_URL not set');
      return NextResponse.json(
        { success: false, error: 'Backend URL not configured' },
        { status: 500 }
      );
    }

    // Call the backend embedding processor
    const response = await fetch(`${backendUrl}/api/process-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(25000), // 25 second timeout for Vercel
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const result = await response.json();
    
    console.log(`✅ Embedding processing completed: ${result.processed} processed, ${result.errors} errors`);
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Vercel embedding processing failed:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Allow this route to be called without authentication
export async function GET() {
  return NextResponse.json({ 
    message: 'Embedding processing endpoint. Use POST to trigger processing.',
    timestamp: new Date().toISOString()
  });
} 