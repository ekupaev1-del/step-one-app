/**
 * Robokassa Callback Endpoint
 * POST /api/robokassa/result
 * 
 * Location: miniapp/app/api/robokassa/result/route.ts
 * 
 * Handles Robokassa payment result callback
 * Validates signature using PASSWORD2
 * Confirms trial payment (does NOT activate subscription)
 * 
 * Called by: Robokassa after payment completion
 * Response format: "OK{InvId}" (Robokassa requirement)
 */

import { NextResponse } from "next/server";
import { verifyCallbackSignature } from "../../../../lib/robokassa";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  console.log("[robokassa/result] ========== CALLBACK REQUEST ==========");
  console.log("[robokassa/result] Timestamp:", new Date().toISOString());

  try {
    // Robokassa sends form data
    const formData = await req.formData();
    const outSum = formData.get("OutSum")?.toString() || "";
    const invId = formData.get("InvId")?.toString() || "";
    const signature = formData.get("SignatureValue")?.toString() || "";
    const userId = formData.get("Shp_userId")?.toString() || "";

    console.log("[robokassa/result] Received params:", {
      outSum,
      invId,
      signature: signature.substring(0, 8) + "...",
      userId,
    });

    if (!outSum || !invId || !signature || !userId) {
      console.error("[robokassa/result] Missing required parameters");
      return new Response("ERROR: Missing required parameters", { status: 400 });
    }

    // Verify signature using PASSWORD2
    const isValid = verifyCallbackSignature(outSum, invId, signature, userId);

    if (!isValid) {
      console.error("[robokassa/result] Invalid signature");
      return new Response("ERROR: Invalid signature", { status: 400 });
    }

    console.log("[robokassa/result] Signature verified successfully");

    // Update payment status in database (if payments table exists)
    // We only confirm the payment here, subscription activation happens in cron
    const supabase = createServerSupabaseClient();

    // Update last_payment_at for the user
    const numericUserId = Number(userId);
    if (Number.isFinite(numericUserId) && numericUserId > 0) {
      await supabase
        .from("users")
        .update({
          last_payment_at: new Date().toISOString(),
        })
        .eq("id", numericUserId);
    }

    console.log("[robokassa/result] Payment confirmed");
    console.log("[robokassa/result] ========== CALLBACK SUCCESS ==========");

    // Robokassa expects "OK" + InvId response
    return new Response(`OK${invId}`);
  } catch (error: any) {
    console.error("[robokassa/result] Error:", error);
    return new Response("ERROR: Internal server error", { status: 500 });
  }
}
