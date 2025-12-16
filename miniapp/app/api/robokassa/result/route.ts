import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

async function parseParams(req: Request) {
  const urlParams = new URL(req.url).searchParams;
  if (req.method === "POST") {
    const text = await req.text();
    const formParams = new URLSearchParams(text);
    formParams.forEach((value, key) => urlParams.set(key, value));
  }
  return urlParams;
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  try {
    const password2 = process.env.ROBOKASSA_PASSWORD2;
    if (!password2) {
      return NextResponse.json(
        { ok: false, error: "ROBOKASSA_PASSWORD2 не задан" },
        { status: 500 }
      );
    }

    const params = await parseParams(req);
    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");

    if (!outSum || !invId || !signature) {
      return NextResponse.json(
        { ok: false, error: "Не хватает параметров OutSum/InvId/SignatureValue" },
        { status: 400 }
      );
    }

    const signatureBase = `${outSum}:${invId}:${password2}`;
    const computed = md5(signatureBase).toLowerCase();
    if (computed !== signature.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Неверная подпись" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, user_id, is_recurring, previous_invoice_id")
      .eq("invoice_id", invId)
      .maybeSingle();

    if (paymentError || !payment) {
      return NextResponse.json(
        { ok: false, error: "Платёж не найден" },
        { status: 404 }
      );
    }

    const now = new Date();
    // Активируем триал на 3 дня после первой оплаты
    const trialEndAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    // После окончания триала подписка будет активна еще 30 дней
    const subscriptionEnd = new Date(trialEndAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Обновляем платёж
    await supabase
      .from("payments")
      .update({ status: "success" })
      .eq("id", payment.id);

    // Обновляем пользователя: активируем триал на 3 дня
    await supabase
      .from("users")
      .update({
        subscription_status: "trial",
        trial_end_at: trialEndAt.toISOString(),
        subscription_end_at: subscriptionEnd.toISOString(),
        robokassa_parent_invoice_id: payment.previous_invoice_id || invId,
        last_payment_status: "success",
      })
      .eq("id", payment.user_id);

    return new NextResponse("OK", { status: 200 });
  } catch (error: any) {
    console.error("[robokassa/result] error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
