/**
 * Robokassa SuccessURL Handler
 * GET /api/subscription/webhook/robokassa-success
 * 
 * Handles user redirect after successful payment (informational only)
 * Source of truth is ResultURL webhook, not this endpoint
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { verifyRobokassaResultSignature, parseShpParams } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `robokassa-success-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");

    // Parse Shp_ parameters
    const shpParams = parseShpParams(params);

    // Get userId from Shp params
    let userId: number | null = null;
    if (shpParams.userId) {
      const userIdNum = Number(shpParams.userId);
      if (Number.isFinite(userIdNum) && userIdNum > 0) {
        userId = userIdNum;
      }
    }

    // Verify signature (optional for Success URL, but good practice)
    if (outSum && invId && signature) {
      const isValid = verifyRobokassaResultSignature({
        outSum,
        invId,
        signature,
        shpParams,
        requestId,
      });

      if (!isValid) {
        console.warn(`[robokassa-success:${requestId}] Invalid signature (informational only)`);
      }
    }

    // Redirect user to subscription page with success message
    const redirectUrl = userId 
      ? `/subscription?id=${userId}&payment=success`
      : `/subscription?payment=success`;

    return NextResponse.redirect(new URL(redirectUrl, req.url));
  } catch (error: any) {
    console.error(`[robokassa-success:${requestId}] Unexpected error:`, error);
    // Still redirect to subscription page
    return NextResponse.redirect(new URL("/subscription?payment=success", req.url));
  }
}
