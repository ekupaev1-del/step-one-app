import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ ok: false, error: "Вопрос обязателен" }, { status: 400 });
    }

    const system = `Ты — эксперт-диетолог. Отвечай только на вопросы о питании, привычках и продуктах. 
Строго запрещено выдавать готовые меню или расписание приемов пищи. 
Если просят меню или готовый план, вежливо откажись и предложи общие рекомендации. 
Отвечай кратко и по делу на русском.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: question }
      ],
      temperature: 0.5,
      max_tokens: 500
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "Не удалось получить ответ";

    return NextResponse.json({ ok: true, answer });
  } catch (error: any) {
    console.error("[/api/ask] error", error);
    return NextResponse.json({ ok: false, error: "Ошибка обработки запроса" }, { status: 500 });
  }
}
