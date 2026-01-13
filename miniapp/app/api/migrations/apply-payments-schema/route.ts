/**
 * Apply Payments Table Schema Migration
 * POST /api/migrations/apply-payments-schema
 * 
 * Executes the payments table schema migration via Supabase
 * Requires SUPABASE_SERVICE_ROLE_KEY
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const MIGRATION_SECRET = process.env.MIGRATION_SECRET || "default-secret-change-in-production";

/**
 * Read migration file
 */
function readMigrationFile(): string {
  try {
    // Try to read from migrations directory (relative to project root)
    const migrationPath = join(process.cwd(), "..", "migrations", "fix_payments_table_schema.sql");
    return readFileSync(migrationPath, "utf-8");
  } catch (e) {
    // Fallback: try from current directory
    try {
      const migrationPath = join(process.cwd(), "migrations", "fix_payments_table_schema.sql");
      return readFileSync(migrationPath, "utf-8");
    } catch (e2) {
      // Last resort: try from step-one-app root
      try {
        const migrationPath = join(process.cwd(), "..", "..", "migrations", "fix_payments_table_schema.sql");
        return readFileSync(migrationPath, "utf-8");
      } catch (e3) {
        throw new Error(`Cannot read migration file: ${(e3 as Error).message}`);
      }
    }
  }
}

/**
 * Execute SQL via Supabase using RPC (if available) or direct query
 */
async function executeMigrationSQL(supabase: any, sql: string): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    // Supabase JS client doesn't support DDL directly
    // We need to use the Management API or SQL Editor
    // For now, we'll try to execute via RPC if a function exists
    // Otherwise, we'll return instructions
    
    // Try to split SQL into statements and execute via RPC
    // Note: This won't work for DDL, but we'll try anyway
    
    // Actually, Supabase doesn't allow DDL via PostgREST
    // We need to use the Management API or SQL Editor
    
    // Return the SQL for manual execution
    return {
      success: false,
      error: "Supabase JS client cannot execute DDL statements. Please use SQL Editor or Supabase CLI.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to execute migration",
    };
  }
}

export async function POST(req: Request) {
  const requestId = `migrate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[migrations/apply-payments-schema:${requestId}] ========== MIGRATION REQUEST ==========`);

  // Security check
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${MIGRATION_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    console.error(`[migrations/apply-payments-schema:${requestId}] Unauthorized`);
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Set MIGRATION_SECRET env variable and use Authorization: Bearer header." },
      { status: 401 }
    );
  }

  try {
    // Read migration file
    let sql: string;
    try {
      sql = readMigrationFile();
      console.log(`[migrations/apply-payments-schema:${requestId}] Migration file loaded (${sql.length} chars)`);
    } catch (error: any) {
      return NextResponse.json(
        { ok: false, error: `Cannot read migration file: ${error.message}` },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Verify connection
    const { data: testData, error: testError } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (testError) {
      console.error(`[migrations/apply-payments-schema:${requestId}] Database connection error:`, testError);
      return NextResponse.json(
        { ok: false, error: `Database connection failed: ${testError.message}` },
        { status: 500 }
      );
    }

    console.log(`[migrations/apply-payments-schema:${requestId}] Database connection verified`);

    // Note: Supabase JS client cannot execute DDL statements
    // Return SQL for manual execution
    return NextResponse.json({
      ok: true,
      message: "Migration SQL prepared. Supabase JS client cannot execute DDL statements directly.",
      instruction: "Please execute this SQL in Supabase SQL Editor",
      sql: sql,
      steps: [
        "1. Open Supabase Dashboard → SQL Editor",
        "2. Copy the SQL from the 'sql' field above",
        "3. Paste into SQL Editor",
        "4. Click 'Run'",
        "5. Wait 1-2 minutes for schema cache to refresh",
      ],
      requestId,
    });
  } catch (error: any) {
    console.error(`[migrations/apply-payments-schema:${requestId}] Error:`, error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error", requestId },
      { status: 500 }
    );
  }
}
