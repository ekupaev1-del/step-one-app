/**
 * Payment Provider Health Check
 * GET /api/payments/health
 * 
 * Reports payment provider configuration status
 */

import { NextResponse } from "next/server";
import { getRobokassaConfig } from "../../../../lib/payments/robokassaConfig";

export const dynamic = "force-dynamic";

/**
 * Get payments table schema info
 */
async function getPaymentsTableSchema(supabase: any) {
  try {
    // Try to query schema information
    // Note: Supabase JS client doesn't support direct schema queries
    // We'll infer from a test query
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .limit(0);
    
    if (error) {
      return { error: error.message };
    }
    
    // Return basic info (detailed schema requires SQL query)
    return {
      tableExists: true,
      note: "Detailed schema requires SQL query: SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'payments'",
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function GET(req: Request) {
  try {
    const robokassaStatus = getRobokassaConfig();
    
    // Get payments table schema info
    const { createServerSupabaseClient } = await import("../../../../lib/supabaseAdmin");
    const supabase = createServerSupabaseClient();
    const schemaInfo = await getPaymentsTableSchema(supabase);

    return NextResponse.json({
      ok: true,
      providers: {
        robokassa: {
          configured: robokassaStatus.configured,
          missingEnvVars: robokassaStatus.missingEnvVars,
          envVarStatus: robokassaStatus.envVarStatus,
          source: robokassaStatus.source,
        },
      },
      paymentsTable: schemaInfo,
    });
  } catch (error: any) {
    console.error("[payments/health] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
