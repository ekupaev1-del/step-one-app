/**
 * Database Health Check Endpoint
 * GET /api/health/db
 * 
 * Checks if database connection is reachable and working
 * Returns { ok: true } if DB is accessible, { ok: false, requestId } otherwise
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `health-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const operationName = "healthCheckDb";
  
  // Log environment status (boolean only, no secrets)
  const hasSupabaseUrl = !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  
  console.log(`[health/db:${requestId}] Operation: ${operationName}`);
  console.log(`[health/db:${requestId}] Environment: isProduction=${isProduction}, hasSupabaseUrl=${hasSupabaseUrl}, hasSupabaseKey=${hasSupabaseKey}`);
  
  if (!hasSupabaseUrl || !hasSupabaseKey) {
    console.error(`[health/db:${requestId}] Missing required environment variables`);
    return NextResponse.json(
      { 
        ok: false, 
        requestId,
        error: "Database configuration missing",
        hasSupabaseUrl,
        hasSupabaseKey,
      },
      { status: 500 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    
    // Simple query to verify DB connection
    // Using users table as it's the primary table
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      // Detailed Postgres error logging
      const dbErrorDetails = {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      };
      console.error(`[health/db:${requestId}] Database connection failed:`, {
        operation: operationName,
        dbError: dbErrorDetails,
      });
      
      return NextResponse.json(
        { 
          ok: false, 
          requestId,
          error: "Database connection failed",
          dbErrorCode: error.code,
        },
        { status: 500 }
      );
    }

    // Success - DB is reachable
    console.log(`[health/db:${requestId}] Database connection successful`);
    return NextResponse.json({ 
      ok: true, 
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Catch any unexpected errors
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code,
    };
    console.error(`[health/db:${requestId}] Unexpected error during health check:`, {
      operation: operationName,
      error: errorDetails,
    });
    
    return NextResponse.json(
      { 
        ok: false, 
        requestId,
        error: "Health check failed",
      },
      { status: 500 }
    );
  }
}
