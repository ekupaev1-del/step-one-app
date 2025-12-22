import fetch from "node-fetch";
import crypto from "crypto";
import { supabase } from "./supabase.js";
import { env } from "../config/env.js";

const SUBSCRIPTION_AMOUNT = 199;
const RECURRING_URL = "https://auth.robokassa.ru/Merchant/Recurring";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

// STEP 4: Receipt НЕ используется для recurring-платежей

/**
 * Списывает 199 RUB с пользователя после окончания триала или для продления подписки
 */
async function chargeUserAfterTrial(user: any) {
  if (!user.robokassa_initial_invoice_id) {
    console.error(`[recurring] User ${user.id} has no robokassa_initial_invoice_id`);
    return;
  }

  // Генерируем новый InvoiceID (числовой формат)
  // КРИТИЧНО: Robokassa требует InvoiceID как int32 (<= 2147483647)
  // НЕ используем timestamp - он слишком большой!
  const MAX_INT32 = 2147483647;
  const base = user.id * 1000000; // userId * 1M
  const random = Math.floor(Math.random() * 1000000); // 0-999999
  let invoiceIdNum = base + random;
  
  // Проверяем, что InvoiceID <= 2147483647
  if (invoiceIdNum > MAX_INT32) {
    invoiceIdNum = Math.floor(Math.random() * MAX_INT32) + 1; // 1-2147483647
  }
  
  const invoiceId = String(invoiceIdNum);
  const receiptJson = buildSubscriptionReceipt();
  const receiptEncoded = encodeURIComponent(receiptJson);

  // PART 2: ВАЖНО: OutSum должен быть строкой с двумя знаками после запятой
  const outSumStr = SUBSCRIPTION_AMOUNT.toFixed(2); // "199.00"

  // PART 2: SignatureValue для recurring-платежа:
  // md5(MerchantLogin:OutSum:InvoiceID:Password2)
  //
  // ВАЖНО:
  // - PreviousInvoiceID НЕ включается в подпись
  // - Receipt НЕ отправляется для recurring
  // - Recurring НЕ отправляется
  const signatureBase = `${env.robokassaMerchantLogin}:${outSumStr}:${invoiceId}:${env.robokassaPassword2}`;
  const signatureValue = md5(signatureBase).toLowerCase();

  const description = "Подписка Step One — 1 месяц";
  const body = new URLSearchParams({
    MerchantLogin: env.robokassaMerchantLogin,
    InvoiceID: invoiceId,
    PreviousInvoiceID: user.robokassa_initial_invoice_id,
    OutSum: outSumStr, // "199.00" - строка с двумя знаками
    Description: description,
    SignatureValue: signatureValue,
    // PART 2: Receipt НЕ отправляется для recurring
    // PART 2: Recurring НЕ отправляется
  });

  console.log(`[recurring] PART 2: Signature base (без пароля): ${env.robokassaMerchantLogin}:${outSumStr}:${invoiceId}:[PASSWORD_HIDDEN]`);
  console.log(`[recurring] PART 2: Signature value: ${signatureValue}`);

  console.log(`[recurring] STEP 4: Charging user ${user.id}`);
  console.log(`[recurring] STEP 4: Parent invoice: ${user.robokassa_initial_invoice_id}`);
  console.log(`[recurring] STEP 4: New invoice: ${invoiceId}`);
  console.log(`[recurring] STEP 4: Receipt NOT sent (for recurring not needed)`);

  // Записываем платеж как pending перед запросом
  const { data: paymentRow } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      invoice_id: invoiceId,
      previous_invoice_id: user.robokassa_initial_invoice_id,
      amount: SUBSCRIPTION_AMOUNT,
      status: "pending",
      is_recurring: true,
    })
    .select("id")
    .maybeSingle();

  try {
    console.log(`[recurring] Sending POST request to: ${RECURRING_URL}`);
    console.log(`[recurring] STEP 4: Request body params:`, {
      MerchantLogin: env.robokassaMerchantLogin,
      InvoiceID: invoiceId,
      PreviousInvoiceID: user.robokassa_initial_invoice_id,
      OutSum: outSumStr,
      Description: description,
      SignatureValue: signatureValue.substring(0, 10) + "...",
      Receipt: "NOT SENT",
      Recurring: "NOT SENT",
    });

    const response = await fetch(RECURRING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const text = await response.text();

    console.log(`[recurring] Response status: ${response.status}`);
    console.log(`[recurring] Response text: ${text}`);

    // STEP 4: Robokassa возвращает "OK" при успехе
    if (response.ok && text.trim().toLowerCase() === "ok") {
      // Платеж успешно отправлен
      if (paymentRow) {
        await supabase
          .from("payments")
          .update({ status: "success" })
          .eq("id", paymentRow.id);
      }

      // STEP 4: Обновляем статус подписки
      const now = new Date();
      const paidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
      
      await supabase
        .from("users")
        .update({
          subscription_status: "active",
          paid_until: paidUntil.toISOString(),
          next_charge_at: paidUntil.toISOString(),
          last_payment_status: "success",
        })
        .eq("id", user.id);

      console.log(`[recurring] ✅ Payment successful for user ${user.id}, paid until: ${paidUntil.toISOString()}`);
    } else {
      // STEP 5: ERROR HANDLING - Платеж не прошел
      console.error(`[recurring] ❌ Payment failed for user ${user.id}`);
      console.error(`[recurring] Response code: ${response.status}`);
      console.error(`[recurring] Response message: ${text}`);
      console.error(`[recurring] Full request payload:`, {
        MerchantLogin: env.robokassaMerchantLogin,
        OutSum: outSumStr,
        InvoiceID: invoiceId,
        PreviousInvoiceID: user.robokassa_initial_invoice_id,
        Description: description,
        SignatureValue: signatureValue.substring(0, 10) + "...",
      });
      
      if (paymentRow) {
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", paymentRow.id);
      }

      await supabase
        .from("users")
        .update({ 
          subscription_status: "payment_failed",
          last_payment_status: "failed" 
        })
        .eq("id", user.id);

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
    // STEP 5: ERROR HANDLING
    console.error(`[recurring] Charge error for user ${user.id}:`, error);
    console.error(`[recurring] Error details:`, {
      message: error?.message,
      stack: error?.stack,
    });
    
    if (paymentRow) {
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("id", paymentRow.id);
    }
    
    await supabase
      .from("users")
      .update({ 
        subscription_status: "payment_failed",
        last_payment_status: "failed" 
      })
      .eq("id", user.id);
    
    // STEP 5: Уведомляем пользователя
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
            message: "❌ Ошибка оплаты подписки. Пожалуйста, проверьте карту или обратитесь в поддержку.",
          }),
        });
      }
    } catch (notifyError) {
      console.error(`[recurring] Error notifying user ${user.id}:`, notifyError);
    }
  }
}

/**
 * STEP 4: Проверяет триалы, которые закончились, и списывает 199 RUB
 * Проверяет: trial_ends_at < now() AND subscription_active = true
 */
export async function runRecurringBilling() {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log("[recurring] ========== STEP 4: CHECKING EXPIRED TRIALS ==========");
  console.log("[recurring] Current time:", nowISO);

  // STEP 4: Находим пользователей с истекшими триалами
  // trial_ends_at < now() AND subscription_status = 'trial'
  const { data: users, error } = await supabase
    .from("users")
    .select("id, trial_end_at, robokassa_initial_invoice_id")
    .eq("subscription_status", "trial")
    .not("trial_end_at", "is", null)
    .not("robokassa_initial_invoice_id", "is", null)
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
 * STEP 4: Проверяет активные подписки, которые заканчиваются, и продлевает их
 * Проверяет: subscription_status = 'active' AND next_charge_at <= now()
 */
export async function renewActiveSubscriptions() {
  const now = new Date();
  const nowISO = now.toISOString();

  console.log("[recurring] ========== STEP 4: CHECKING EXPIRING SUBSCRIPTIONS ==========");
  console.log("[recurring] Current time:", nowISO);

  // STEP 4: Находим пользователей с активными подписками, которые нужно продлить
  const { data: users, error } = await supabase
    .from("users")
    .select("id, next_charge_at, robokassa_initial_invoice_id")
    .eq("subscription_status", "active")
    .not("robokassa_initial_invoice_id", "is", null)
    .not("next_charge_at", "is", null)
    .lte("next_charge_at", nowISO);

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
