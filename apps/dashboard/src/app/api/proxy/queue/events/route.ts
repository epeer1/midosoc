import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  let token: string | null = null;

  if (process.env.SKIP_AUTH === 'true' || process.env.NODE_ENV !== 'production') {
    token = process.env.ADMIN_SECRET || 'local_dev_secret';
  } else {
    try {
      const session = await auth0.getSession();
      token = session?.tokenSet?.accessToken ?? null;
    } catch (e) {
      // Auth0 session not available
    }
  }

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${apiUrl}/queue/events`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok || !response.body) {
      return NextResponse.json({ error: 'SSE connection failed' }, { status: 502 });
    }

    // Stream the SSE response through
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
