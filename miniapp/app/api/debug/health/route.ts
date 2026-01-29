/**
 * Protected Debug Health Endpoint
 * 
 * Returns environment status and performs test operations.
 * Protected by DEBUG_SECRET query parameter.
 * 
 * GET /api/debug/health?secret=YOUR_DEBUG_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { logEvent, generateRequestId } from "@/lib/logging";

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const searchParams = req.nextUrl.searchParams;
  const providedSecret = searchParams.get("secret");
  const expectedSecret = process.env.DEBUG_SECRET;

  // Check secret
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "DEBUG_SECRET not configured" },
      { status: 500 }
    );
  }

  if (providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized - invalid secret" },
      { status: 403 }
    );
  }

  try {
    // Check environment variables
    const envStatus = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasTelegramBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasDebugSecret: !!process.env.DEBUG_SECRET,
    };

    // Get deployment identifier (Vercel provides this)
    const deploymentId =
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      "unknown";

    // Test Supabase connection and insert
    let canInsertLogs = false;
    let supabaseError: string | null = null;

    try {
      const supabase = createServerSupabaseClient();

      // Test insert into app_logs
      const testLogEntry = {
        level: "info",
        source: "debug_health_check",
        request_id: requestId,
        payload: { test: true, timestamp: new Date().toISOString() },
      };

      const { error: insertError } = await supabase
        .from("app_logs")
        .insert(testLogEntry);

      if (insertError) {
        supabaseError = `${insertError.code || "UNKNOWN"}: ${insertError.message}`;
        canInsertLogs = false;
      } else {
        canInsertLogs = true;
      }
    } catch (err: any) {
      supabaseError = err?.message || String(err);
      canInsertLogs = false;
    }

    // Log the health check
    await logEvent("info", "debug_health_check", {
      requestId,
      payload: {
        envStatus,
        canInsertLogs,
        deploymentId,
      },
    });

    return NextResponse.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      environment: {
        ...envStatus,
        deploymentId,
      },
      supabase: {
        canInsertLogs,
        error: supabaseError,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || String(error),
        requestId,
      },
      { status: 500 }
    );
  }
}
