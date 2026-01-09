/**
 * Robokassa Fail URL Handler
 * GET /api/robokassa/fail
 * 
 * Called by Robokassa after failed/cancelled payment
 * Redirects user back to profile page with error message
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  console.log("[robokassa/fail] ========== FAIL REDIRECT ==========");
  console.log("[robokassa/fail] Timestamp:", new Date().toISOString());

  try {
    const url = new URL(req.url);
    const invId = url.searchParams.get("InvId");
    const outSum = url.searchParams.get("OutSum");
    const userId = url.searchParams.get("Shp_userId");

    console.log("[robokassa/fail] Received params:", {
      invId,
      outSum,
      userId,
    });

    if (!userId) {
      console.error("[robokassa/fail] Missing userId");
      // Redirect to home if no userId
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Redirect to profile page with error indicator
    const redirectUrl = new URL(`/profile?id=${userId}&payment=failed`, req.url);
    console.log("[robokassa/fail] Redirecting to:", redirectUrl.toString());
    
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error("[robokassa/fail] Error:", error);
    // Still redirect to profile
    const url = new URL(req.url);
    const userId = url.searchParams.get("Shp_userId");
    if (userId) {
      return NextResponse.redirect(new URL(`/profile?id=${userId}`, req.url));
    }
    return NextResponse.redirect(new URL("/", req.url));
  }
}
