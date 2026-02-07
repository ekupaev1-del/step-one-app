import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/db
 * Diagnostic endpoint for database connectivity
 * Returns detailed error information without leaking secrets
 */
export async function GET() {
  const requestId = `health-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Check environment variables
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!hasUrl || !hasServiceKey) {
      return NextResponse.json({
        ok: false,
        error: "Missing environment variables",
        details: {
          hasSupabaseUrl: hasUrl,
          hasServiceKey: hasServiceKey,
          hasAnonKey: hasAnonKey,
        },
        requestId,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Try to create Supabase client
    let supabase;
    try {
      supabase = createServerSupabaseClient();
    } catch (clientError: any) {
      console.error(`[${requestId}] Failed to create Supabase client:`, {
        error: clientError.message,
        stack: clientError.stack,
      });
      
      return NextResponse.json({
        ok: false,
        error: "Failed to create Supabase client",
        details: {
          message: clientError.message,
          // Don't leak stack in production
          stack: process.env.NODE_ENV === 'development' ? clientError.stack : undefined,
        },
        requestId,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Test 1: Simple SELECT query
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (usersError) {
      console.error(`[${requestId}] Database query failed:`, {
        code: usersError.code,
        message: usersError.message,
        details: usersError.details,
        hint: usersError.hint,
      });

      return NextResponse.json({
        ok: false,
        error: "Database query failed",
        details: {
          code: usersError.code || 'UNKNOWN',
          message: usersError.message || 'Unknown error',
          details: usersError.details || null,
          hint: usersError.hint || null,
          // Include constraint/table info if available (safe to expose)
          constraint: (usersError as any).constraint || null,
          table: (usersError as any).table || null,
          column: (usersError as any).column || null,
        },
        requestId,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Test 2: Check if tables exist
    const tablesToCheck = ['users', 'diary', 'subscriptions', 'payments', 'reminders', 'water_logs', 'app_logs', 'robokassa_invoices'];
    const tableStatus: Record<string, boolean> = {};
    
    for (const table of tablesToCheck) {
      try {
        const { error: tableError } = await supabase
          .from(table)
          .select("id")
          .limit(0);
        tableStatus[table] = !tableError;
      } catch (e: any) {
        tableStatus[table] = false;
      }
    }

    // Test 3: Try a simple INSERT into app_logs (if table exists)
    let insertTest = null;
    if (tableStatus['app_logs']) {
      const { error: insertError } = await supabase
        .from('app_logs')
        .insert({
          level: 'info',
          source: 'health_check',
          request_id: requestId,
          message: 'Health check test',
        });
      
      insertTest = {
        success: !insertError,
        error: insertError ? {
          code: insertError.code,
          message: insertError.message,
        } : null,
      };
    }

    return NextResponse.json({
      ok: true,
      database: "connected",
      tests: {
        select: { success: true, rowCount: usersData?.length || 0 },
        tables: tableStatus,
        insert: insertTest,
      },
      environment: {
        hasSupabaseUrl: hasUrl,
        hasServiceKey: hasServiceKey,
        hasAnonKey: hasAnonKey,
        nodeEnv: process.env.NODE_ENV || 'unknown',
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[${requestId}] Unexpected error in health check:`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      ok: false,
      error: "Internal error",
      details: {
        message: error.message || 'Unknown error',
        // Don't leak stack in production
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      requestId,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
