/**
 * Subscription Status Endpoint
 * GET /api/subscription/status?userId=<id>
 * 
 * Returns current subscription status for user
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { getUserIdFromRequest } from "../../../../lib/getUserId";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `subscription-status-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const userId = await getUserIdFromRequest(req);
    
    if (!userId) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "userId обязателен (используйте ?userId=123 или ?id=123)",
          requestId 
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          error: error.message || "Database error",
          requestId 
        },
        { status: 500 }
      );
    }

    // Format response
    const result = {
      ok: true,
      hasSubscription: !!subscription,
      active: subscription?.status === "active" || subscription?.status === "trialing",
      status: subscription?.status || null,
      activeUntil: subscription?.active_until || null,
      nextChargeAt: subscription?.next_charge_at || null,
      planCode: subscription?.plan_code || null,
      requestId,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[subscription/status:${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error?.message || "Internal server error",
        requestId 
      },
      { status: 500 }
    );
  }
}
