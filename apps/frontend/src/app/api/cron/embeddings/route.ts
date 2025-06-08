import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    
    if (!backendUrl) {
      console.error('NEXT_PUBLIC_BACKEND_URL not set');
      return NextResponse.json(
        { success: false, error: 'Backend URL not configured' },
        { status: 500 }
      );
    }

    console.log('🕒 Cron job: Checking for pending embeddings...');

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
    
    if (result.processed > 0) {
      console.log(`✅ Cron: Processed ${result.processed} embeddings, ${result.errors} errors`);
    } else {
      console.log('⏭️ Cron: No pending embeddings to process');
    }
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
      source: 'cron'
    });

  } catch (error: any) {
    console.error('❌ Cron embedding processing failed:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        source: 'cron'
      },
      { status: 500 }
    );
  }
} 