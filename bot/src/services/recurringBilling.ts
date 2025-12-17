import fetch from "node-fetch";
import crypto from "crypto";
import { supabase } from "./supabase.js";
import { env } from "../config/env.js";

const SUBSCRIPTION_AMOUNT = 199;
const DESCRIPTION = "Step One subscription (1 month)";
const RECURRING_URL = "https://auth.robokassa.ru/Merchant/Recurring";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildReceipt(amount: number) {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed)
    items: [
      {
        name: DESCRIPTION,
        quantity: 1,
        sum: amount,
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  return JSON.stringify(receipt);
}

/**
 * Списывает 199 RUB с пользователя после окончания триала
 */
async function chargeUserAfterTrial(user: any) {
  if (!user.robokassa_parent_invoice_id) {
    console.error(`[recurring] User ${user.id} has no parent_invoice_id`);
    return;
  }

  const invoiceId = `rec_${user.id}_${Date.now()}`;
  const { json: receiptJson, encoded: receiptEncoded } = {
    json: buildReceipt(SUBSCRIPTION_AMOUNT),
    encoded: encodeURIComponent(buildReceipt(SUBSCRIPTION_AMOUNT)),
  };

  // SignatureValue: MerchantLogin:OutSum:InvoiceID:Receipt:Password1
  // PreviousInvoiceID НЕ включается в подпись для рекуррентных платежей
  const signatureBase = `${env.robokassaMerchantLogin}:${SUBSCRIPTION_AMOUNT}:${invoiceId}:${receiptJson}:${env.robokassaPassword1}`;
  const signatureValue = md5(signatureBase).toLowerCase();

  const body = new URLSearchParams({
    MerchantLogin: env.robokassaMerchantLogin,
    InvoiceID: invoiceId,
    PreviousInvoiceID: user.robokassa_parent_invoice_id,
    OutSum: SUBSCRIPTION_AMOUNT.toString(),
    Description: DESCRIPTION,
    SignatureValue: signatureValue,
    Receipt: receiptEncoded,
  });

  console.log(`[recurring] Charging user ${user.id} after trial`);
  console.log(`[recurring] Parent invoice: ${user.robokassa_parent_invoice_id}`);
  console.log(`[recurring] New invoice: ${invoiceId}`);

  // Записываем платеж как pending перед запросом
  const { data: paymentRow } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      invoice_id: invoiceId,
      previous_invoice_id: user.robokassa_parent_invoice_id,
      amount: SUBSCRIPTION_AMOUNT,
      status: "pending",
      is_recurring: true,
    })
    .select("id")
    .maybeSingle();

  try {
    const response = await fetch(RECURRING_URL, {
      method: "POST",
      body,
    });
    const text = await response.text();

    console.log(`[recurring] Response status: ${response.status}`);
    console.log(`[recurring] Response text: ${text.substring(0, 200)}`);

    if (response.ok && text.toLowerCase().includes("ok")) {
      // Платеж успешно отправлен
      if (paymentRow) {
        await supabase
          .from("payments")
          .update({ status: "sent" })
          .eq("id", paymentRow.id);
      }

      await supabase
        .from("users")
        .update({ last_payment_status: "sent" })
        .eq("id", user.id);

      console.log(`[recurring] ✅ Payment sent for user ${user.id}`);
    } else {
      // Платеж не прошел
      if (paymentRow) {
        await supabase
          .from("payments")
          .update({ status: "fail" })
          .eq("id", paymentRow.id);
      }

      await supabase
        .from("users")
        .update({ 
          subscription_status: "payment_failed",
          last_payment_status: "fail" 
        })
        .eq("id", user.id);

      console.error(`[recurring] ❌ Payment failed for user ${user.id}`);

      // Отправляем уведомление пользователю о неудачном платеже
      try {
        const { data: userData } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("id", user.id)
          .maybeSingle();
        
        if (userData?.telegram_id) {
          const notifyUrl = process.env.MINIAPP_BASE_URL 
            ? `${process.env.MINIAPP_BASE_URL}/api/notify-bot`
            : "https://step-one-app-git-dev-emins-projects-4717eabc.vercel.app/api/notify-bot";
          
          await fetch(notifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              message: "❌ Ошибка оплаты. Триал закончился, но автоматическое списание не прошло. Пожалуйста, проверьте карту или обратитесь в поддержку.",
            }),
          });
        }
      } catch (notifyError) {
        console.error(`[recurring] Error notifying user ${user.id}:`, notifyError);
      }
    }
  } catch (error: any) {
    console.error(`[recurring] Charge error for user ${user.id}:`, error);
    
    if (paymentRow) {
      await supabase
        .from("payments")
        .update({ status: "fail" })
        .eq("id", paymentRow.id);
    }
    
    await supabase
      .from("users")
      .update({ 
        subscription_status: "payment_failed",
        last_payment_status: "fail" 
      })
      .eq("id", user.id);
  }
}

/**
 * Проверяет триалы, которые закончились, и списывает 199 RUB
 */
export async function runRecurringBilling() {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log("[recurring] ========== CHECKING EXPIRED TRIALS ==========");
  console.log("[recurring] Current time:", nowISO);

  // Находим пользователей с истекшими триалами
  const { data: users, error } = await supabase
    .from("users")
    .select("id, trial_end_at, robokassa_parent_invoice_id")
    .eq("subscription_status", "trial")
    .not("trial_end_at", "is", null)
    .not("robokassa_parent_invoice_id", "is", null)
    .lte("trial_end_at", nowISO);

  if (error) {
    console.error("[recurring] Fetch users error:", error);
    return;
  }

  if (!users || users.length === 0) {
    console.log("[recurring] No expired trials found");
    return;
  }

  console.log(`[recurring] Found ${users.length} expired trial(s)`);

  for (const user of users) {
    await chargeUserAfterTrial(user);
  }

  console.log("[recurring] ============================================");
}

/**
 * Проверяет активные подписки, которые заканчиваются, и продлевает их
 */
export async function renewActiveSubscriptions() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowISO = tomorrow.toISOString();

  console.log("[recurring] ========== CHECKING EXPIRING SUBSCRIPTIONS ==========");

  // Находим пользователей с активными подписками, которые заканчиваются завтра
  const { data: users, error } = await supabase
    .from("users")
    .select("id, paid_until, robokassa_parent_invoice_id")
    .eq("subscription_status", "active")
    .not("robokassa_parent_invoice_id", "is", null)
    .not("paid_until", "is", null)
    .lte("paid_until", tomorrowISO);

  if (error) {
    console.error("[recurring] Fetch users error:", error);
    return;
  }

  if (!users || users.length === 0) {
    console.log("[recurring] No expiring subscriptions found");
    return;
  }

  console.log(`[recurring] Found ${users.length} expiring subscription(s)`);

  for (const user of users) {
    await chargeUserAfterTrial(user); // Используем ту же функцию для продления
  }

  console.log("[recurring] ====================================================");
}

export function startRecurringBillingScheduler() {
  console.log("⏰ Scheduler автосписаний запущен (каждые 6 часов)");
  
  // Проверяем каждые 6 часов
  setInterval(() => {
    runRecurringBilling().catch((err) =>
      console.error("[recurring] scheduler error", err)
    );
    renewActiveSubscriptions().catch((err) =>
      console.error("[recurring] renewal scheduler error", err)
    );
  }, 6 * 60 * 60 * 1000);
  
  // Также запускаем сразу при старте
  runRecurringBilling().catch((err) =>
    console.error("[recurring] initial run error", err)
  );
  renewActiveSubscriptions().catch((err) =>
    console.error("[recurring] initial renewal error", err)
  );
}
