/**
 * Debug Error Endpoint
 * GET /api/debug/error?code=<requestId>
 * 
 * Protected endpoint to fetch error details by code/requestId
 * Requires DEBUG_ADMIN_KEY env var and x-debug-key header
 */

import { NextResponse } from "next/server";
import { errorStore } from "../../../../lib/errorStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `debug-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if debug mode is enabled
  const debugAdminKey = process.env.DEBUG_ADMIN_KEY;
  if (!debugAdminKey) {
    console.log(`[debug/error:${requestId}] DEBUG_ADMIN_KEY not set, debug endpoint disabled`);
    return NextResponse.json(
      { ok: false, error: "Debug endpoint is disabled (DEBUG_ADMIN_KEY not set)" },
      { status: 403 }
    );
  }

  // Check authorization header
  const authHeader = req.headers.get("x-debug-key");
  if (!authHeader || authHeader !== debugAdminKey) {
    console.warn(`[debug/error:${requestId}] Unauthorized access attempt`);
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Include x-debug-key header." },
      { status: 401 }
    );
  }

  try {
    // Get code from query params
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Missing 'code' query parameter" },
        { status: 400 }
      );
    }

    // Look up error by code/requestId
    const error = errorStore.get(code);
    
    if (!error) {
      return NextResponse.json(
        { ok: false, error: "not_found", code },
        { status: 404 }
      );
    }

    // Return error details
    return NextResponse.json({
      ok: true,
      error,
      requestId,
    });
  } catch (error: any) {
    console.error(`[debug/error:${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error", requestId },
      { status: 500 }
    );
  }
}
