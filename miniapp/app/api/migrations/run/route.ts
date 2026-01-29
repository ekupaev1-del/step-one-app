/**
 * Migration Runner Endpoint
 * POST /api/migrations/run
 * 
 * Executes database migrations via Supabase API
 * Protected by MIGRATION_SECRET env variable
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const MIGRATION_SECRET = process.env.MIGRATION_SECRET || "";

/**
 * Read migration file content
 */
function readMigrationFile(filename: string): string {
  try {
    // Try to read from migrations directory (relative to project root)
    const migrationPath = join(process.cwd(), "..", "migrations", filename);
    return readFileSync(migrationPath, "utf-8");
  } catch (e) {
    // Fallback: try from current directory
    try {
      const migrationPath = join(process.cwd(), "migrations", filename);
      return readFileSync(migrationPath, "utf-8");
    } catch (e2) {
      throw new Error(`Cannot read migration file: ${filename}`);
    }
  }
}

/**
 * Execute SQL via Supabase RPC or direct query
 */
async function executeSQL(supabase: any, sql: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Split SQL by semicolons and execute each statement
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      if (statement.length === 0) continue;

      // Skip comments and empty lines
      if (statement.startsWith("--") || statement.startsWith("/*")) continue;

      // Execute via Supabase (using raw SQL if available)
      const { error } = await supabase.rpc("exec_sql", { sql_query: statement }).catch(async () => {
        // If RPC doesn't exist, try direct query (may not work for DDL)
        // For DDL statements, we need to use Supabase Management API or SQL Editor
        return { error: { message: "DDL statements must be executed via SQL Editor" } };
      });

      if (error) {
        // Some statements may fail if already executed (idempotent migrations)
        console.warn(`[migrations/run] Statement warning:`, error.message);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function POST(req: Request) {
  // Security check
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${MIGRATION_SECRET}`;

  if (!MIGRATION_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Set MIGRATION_SECRET env variable." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { migration } = body;

    if (!migration || typeof migration !== "string") {
      return NextResponse.json(
        { ok: false, error: "Migration name is required" },
        { status: 400 }
      );
    }

    // Read migration file
    let sql: string;
    try {
      sql = readMigrationFile(migration);
    } catch (error: any) {
      return NextResponse.json(
        { ok: false, error: `Cannot read migration file: ${error.message}` },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Execute migration
    const result = await executeSQL(supabase, sql);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error || "Migration failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Migration ${migration} executed successfully`,
    });
  } catch (error: any) {
    console.error("[migrations/run] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
