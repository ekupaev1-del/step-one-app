/**
 * Robokassa Success URL Handler
 * GET /api/robokassa/success
 * 
 * Called by Robokassa after successful payment
 * Redirects user back to profile page with success message
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  console.log("[robokassa/success] ========== SUCCESS REDIRECT ==========");
  console.log("[robokassa/success] Timestamp:", new Date().toISOString());

  try {
    const url = new URL(req.url);
    const invId = url.searchParams.get("InvId");
    const outSum = url.searchParams.get("OutSum");
    const userId = url.searchParams.get("Shp_userId");

    console.log("[robokassa/success] Received params:", {
      invId,
      outSum,
      userId,
    });

    if (!userId) {
      console.error("[robokassa/success] Missing userId");
      // Redirect to home if no userId
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Verify payment was processed (optional - we trust ResultURL callback)
    const supabase = createServerSupabaseClient();
    const numericUserId = Number(userId);
    
    if (Number.isFinite(numericUserId) && numericUserId > 0) {
      // Refresh subscription status from DB
      const { data: user } = await supabase
        .from("users")
        .select("subscription_status, trial_end_at")
        .eq("id", numericUserId)
        .maybeSingle();

      console.log("[robokassa/success] User subscription status:", {
        userId: numericUserId,
        subscription_status: user?.subscription_status,
        trial_end_at: user?.trial_end_at,
      });
    }

    // Redirect to profile page with success indicator
    const redirectUrl = new URL(`/profile?id=${userId}&payment=success`, req.url);
    console.log("[robokassa/success] Redirecting to:", redirectUrl.toString());
    
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error("[robokassa/success] Error:", error);
    // Still redirect to profile, but without success param
    const url = new URL(req.url);
    const userId = url.searchParams.get("Shp_userId");
    if (userId) {
      return NextResponse.redirect(new URL(`/profile?id=${userId}`, req.url));
    }
    return NextResponse.redirect(new URL("/", req.url));
  }
}
