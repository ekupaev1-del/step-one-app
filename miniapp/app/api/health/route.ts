import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabaseAdmin";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    
    // Проверяем подключение к БД
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .limit(1);
    
    if (error) {
      return NextResponse.json({
        ok: false,
        error: "Database connection failed",
        details: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
      }, { status: 500 });
    }
    
    // Проверяем наличие нужных полей в users
    const { data: testUser, error: testError } = await supabase
      .from("users")
      .select("id, subscription_status, trial_started_at, trial_end_at, next_charge_at, robokassa_initial_invoice_id, paid_until")
      .limit(1);
    
    if (testError) {
      return NextResponse.json({
        ok: false,
        error: "Database schema check failed (users table)",
        details: {
          message: testError.message,
          code: testError.code,
          details: testError.details,
          hint: testError.hint,
          suggestion: "Run migrations/update_subscription_system.sql",
        },
      }, { status: 500 });
    }
    
    // Проверяем наличие таблицы payments
    const { data: testPayment, error: paymentError } = await supabase
      .from("payments")
      .select("id")
      .limit(1);
    
    if (paymentError) {
      return NextResponse.json({
        ok: false,
        error: "Database schema check failed (payments table)",
        details: {
          message: paymentError.message,
          code: paymentError.code,
          details: paymentError.details,
          hint: paymentError.hint,
          suggestion: "Run migrations/add_subscriptions.sql to create payments table",
        },
      }, { status: 500 });
    }
    
    // Проверяем переменные окружения
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasRobokassaLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
      hasRobokassaPassword1: !!process.env.ROBOKASSA_PASSWORD1,
      hasRobokassaPassword2: !!process.env.ROBOKASSA_PASSWORD2,
    };
    
    return NextResponse.json({
      ok: true,
      database: "connected",
      schema: "valid",
      environment: envCheck,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || "Internal error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }, { status: 500 });
  }
}
