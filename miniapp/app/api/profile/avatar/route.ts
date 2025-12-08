import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({});
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const formData = await req.formData();
    const userId = formData.get("userId");
    const file = formData.get("file") as File | null;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ ok: false, error: "userId обязателен" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ ok: false, error: "Файл не передан" }, { status: 400 });
    }

    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/${randomUUID()}.${fileExt}`;

    // Загружаем в бакет avatars
    // Используем короткий cacheControl для быстрого обновления
    const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
      cacheControl: "60", // 60 секунд вместо 3600 для быстрого обновления
      upsert: false
    });

    if (uploadError) {
      console.error("[/api/profile/avatar] Ошибка загрузки:", uploadError);
      return NextResponse.json({ ok: false, error: "Ошибка загрузки файла" }, { status: 500 });
    }

    // Получаем публичный URL с cache busting для немедленного обновления
    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    let publicUrl = publicData?.publicUrl || null;
    
    // Добавляем timestamp для cache busting, чтобы аватар обновлялся сразу
    if (publicUrl) {
      const timestamp = Date.now();
      publicUrl = `${publicUrl}?t=${timestamp}`;
    }

    // Сохраняем ссылку в users
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("id", Number(userId));

    if (updateError) {
      console.error("[/api/profile/avatar] Ошибка сохранения url:", updateError);
      return NextResponse.json({ ok: false, error: "Не удалось сохранить ссылку" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, avatarUrl: publicUrl });
  } catch (error: any) {
    console.error("[/api/profile/avatar] Неожиданная ошибка:", error);
    return NextResponse.json({ ok: false, error: error?.message || "Внутренняя ошибка" }, { status: 500 });
  }
}




