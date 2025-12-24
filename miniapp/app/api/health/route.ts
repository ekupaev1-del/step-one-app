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
    
    // Проверяем переменные окружения
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
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
