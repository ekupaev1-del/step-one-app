import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabaseAdmin";

async function handle(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const invId = params.get("InvId");
    const supabase = createServerSupabaseClient();

    if (invId) {
      const { data: payment } = await supabase
        .from("payments")
        .select("id, user_id")
        .eq("invoice_id", invId)
        .maybeSingle();

      if (payment) {
        await supabase
          .from("payments")
          .update({ status: "fail" })
          .eq("id", payment.id);

        await supabase
          .from("users")
          .update({ last_payment_status: "fail" })
          .eq("id", payment.user_id);
      }
    }

    return NextResponse.json({ ok: false, status: "fail" });
  } catch (error: any) {
    console.error("[robokassa/fail] error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
