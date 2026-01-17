/**
 * Onboarding Status Endpoint
 * GET /api/onboarding/status?userId=<id>
 * 
 * Single source of truth for user onboarding state
 * Returns: hasUser, hasConsent, profileComplete
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `onboarding-status-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || url.searchParams.get("id");
    
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

    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `userId должен быть положительным числом, получено: ${userId}`,
          requestId 
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get user data including consent and profile completion
    const { data: user, error } = await supabase
      .from("users")
      .select("id, privacy_accepted, terms_accepted, calories, telegram_id")
      .eq("id", numericId)
      .maybeSingle();

    if (error) {
      console.error(`[onboarding/status:${requestId}] DB error:`, error);
      return NextResponse.json(
        { 
          ok: false, 
          error: error.message || "Database error",
          requestId 
        },
        { status: 500 }
      );
    }

    // hasUser: user exists in database
    const hasUser = !!user;

    // hasConsent: both privacy and terms accepted
    const hasConsent = hasUser && 
      user.privacy_accepted === true && 
      user.terms_accepted === true;

    // profileComplete: user has calories (main indicator of completed questionnaire)
    const profileComplete = hasUser && 
      user.calories !== null && 
      user.calories !== undefined && 
      Number(user.calories) > 0;

    const result = {
      ok: true,
      hasUser,
      hasConsent,
      profileComplete,
      userId: numericId,
      telegram_id: user?.telegram_id || null,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Log for debugging (dev only)
    if (process.env.NODE_ENV === "development") {
      console.log(`[onboarding/status:${requestId}]`, result);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[onboarding/status:${requestId}] Unexpected error:`, error);
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
