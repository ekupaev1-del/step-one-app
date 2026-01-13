/**
 * Payment Provider Health Check
 * GET /api/payments/health
 * 
 * Reports payment provider configuration status
 */

import { NextResponse } from "next/server";
import { getRobokassaConfig } from "../../../../lib/payments/robokassaConfig";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const robokassaStatus = getRobokassaConfig();

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
    });
  } catch (error: any) {
    console.error("[payments/health] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
