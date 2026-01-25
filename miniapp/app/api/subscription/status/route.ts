/**
 * Subscription Status Endpoint
 * GET /api/subscription/status?userId=<id>
 * 
 * Returns current subscription status for user
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { resolveUserIdFromRequest } from "@/lib/resolveUserIdFromRequest";

export const dynamic = "force-dynamic";

// Helper to check if debug should be included
function shouldIncludeDebug(): boolean {
  return (
    process.env.DEBUG_PAYMENTS === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export async function GET(req: NextRequest) {
  const requestId = `subscription-status-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Collect query params for debug
    const url = new URL(req.url);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Collect safe headers for debug
    const headersSubset: Record<string, string> = {};
    const safeHeaders = ["content-type", "user-agent", "accept", "accept-language"];
    safeHeaders.forEach((headerName) => {
      const value = req.headers.get(headerName);
      if (value) {
        headersSubset[headerName] = value;
      }
    });

    // Resolve userId with full diagnostics
    const userIdResolution = await resolveUserIdFromRequest(req);
    const userId = userIdResolution.userId;
    
    if (!userId) {
      const response: any = {
        ok: false,
        error: "userId is required",
        code: "USER_ID_MISSING",
        requestId,
        timestamp: new Date().toISOString(),
      };

      // Include debug info only when DEBUG_PAYMENTS=true or not production
      if (shouldIncludeDebug()) {
        response.debug = {
          queryParams,
          userIdResolution,
          headersSubset,
        };
      }

      return NextResponse.json(response, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Get subscription for user
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(`[subscription/status:${requestId}] DB error:`, error);
      const response: any = {
        ok: false,
        error: error.message || "Database error",
        code: "DATABASE_ERROR",
        requestId,
      };

      if (shouldIncludeDebug()) {
        response.debug = {
          databaseError: {
            message: error.message || "Database error",
            code: error.code,
            hint: error.hint,
          },
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Format response (using new schema fields)
    // Map current_period_end to activeUntil for backward compatibility
    const activeUntil = subscription?.current_period_end || subscription?.active_until || null;
    
    const result: any = {
      ok: true,
      hasSubscription: !!subscription,
      active: subscription?.status === "active" || subscription?.status === "trialing",
      status: subscription?.status || null,
      activeUntil: activeUntil,
      nextChargeAt: subscription?.next_charge_at || null,
      planCode: subscription?.plan_code || null,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Include debug echo when debug enabled
    if (shouldIncludeDebug()) {
      result.debug = {
        queryParams,
        userIdResolution,
        headersSubset,
        resolvedUserId: userId,
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[subscription/status:${requestId}] Unexpected error:`, error);
    const response: any = {
      ok: false,
      error: error?.message || "Internal server error",
      code: "INTERNAL_ERROR",
      requestId,
    };

    if (shouldIncludeDebug()) {
      response.debug = {
        message: error?.message || "Internal server error",
        stack: error?.stack ? error.stack.substring(0, 500) : undefined,
      };
    }

    return NextResponse.json(response, { status: 500 });
  }
}
