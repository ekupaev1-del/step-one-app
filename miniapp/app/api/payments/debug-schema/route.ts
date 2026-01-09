/**
 * Debug Schema Endpoint
 * GET /api/payments/debug-schema
 * 
 * Checks if payments table schema is correct
 * Only available when ?debug=1 or x-debug=1 header
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debugParam = url.searchParams.get("debug") === "1";
  const debugHeader = req.headers.get("x-debug") === "1";
  const isDev = process.env.NODE_ENV !== "production";
  
  if (!debugParam && !debugHeader && !isDev) {
    return NextResponse.json(
      { ok: false, error: "Debug mode required. Add ?debug=1 to URL or x-debug: 1 header." },
      { status: 403 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    
    // Check if payments table exists and get its columns
    const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'payments'
        ORDER BY ordinal_position;
      `
    }).catch(() => {
      // RPC might not exist, use direct query via service role
      return { data: null, error: { message: "RPC not available, using alternative method" } };
    });

    // Check required columns by attempting to select them
    // This will fail if column doesn't exist in PostgREST schema cache
    const requiredColumns = [
      'id',
      'user_id',
      'plan_code',
      'amount',
      'currency', // CRITICAL - this is the one causing the error
      'status',
      'robokassa_invoice_id',
      'payment_url',
      'signature',
      'created_at',
      'updated_at'
    ];

    const schemaCheck: Record<string, boolean> = {};
    const errors: string[] = [];
    const columnDetails: Record<string, any> = {};

    // Try to query each column to see if it exists
    for (const col of requiredColumns) {
      try {
        // Use a harmless query that will fail if column doesn't exist
        const { error: testError } = await supabase
          .from("payments")
          .select(col)
          .limit(0);
        
        const exists = !testError || (!testError.message.includes("Could not find") && !testError.message.includes("schema cache"));
        schemaCheck[col] = exists;
        
        if (testError) {
          const isSchemaCacheError = testError.message.includes("schema cache") || 
                                     testError.message.includes("Could not find");
          if (isSchemaCacheError) {
            errors.push(`Column '${col}': ${testError.message}`);
            columnDetails[col] = {
              exists: false,
              error: testError.message,
              isSchemaCacheError: true
            };
          }
        } else {
          columnDetails[col] = { exists: true };
        }
      } catch (e: any) {
        schemaCheck[col] = false;
        errors.push(`Column '${col}' check failed: ${e.message}`);
        columnDetails[col] = {
          exists: false,
          error: e.message
        };
      }
    }

    // Check if table exists by trying a count
    let tableExists = false;
    let tableError: string | null = null;
    try {
      const { count, error: countError } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true });
      
      tableExists = !countError;
      if (countError) {
        tableError = countError.message;
      }
    } catch (e: any) {
      tableError = e.message;
    }

    const allColumnsExist = requiredColumns.every(col => schemaCheck[col] === true);

    const hasSchemaCacheIssues = errors.some(e => e.includes("schema cache") || e.includes("Could not find"));
    
    return NextResponse.json({
      ok: true,
      tableExists,
      tableError,
      allColumnsExist,
      hasSchemaCacheIssues,
      schemaCheck,
      columnDetails,
      requiredColumns,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
      suggestion: hasSchemaCacheIssues
        ? "PostgREST schema cache is stale. Run in Supabase SQL Editor: SELECT pg_notify('pgrst', 'reload schema'); Then wait 1-2 minutes."
        : !allColumnsExist
        ? "Run migration create_payments_table.sql in Supabase SQL Editor, then refresh cache."
        : "Schema looks correct. If errors persist, refresh PostgREST cache."
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Schema check failed",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
