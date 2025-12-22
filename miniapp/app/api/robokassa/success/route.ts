import { NextResponse } from "next/server";

/**
 * Success URL - куда Robokassa редиректит пользователя после успешной оплаты
 * ВАЖНО: Это просто подтверждение для пользователя, основная обработка идет через Result URL
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const invId = url.searchParams.get("InvId");
  const outSum = url.searchParams.get("OutSum");
  const shpUserId = url.searchParams.get("Shp_userId");
  
  console.log("[robokassa/success] Success URL called:", {
    invId,
    outSum,
    shpUserId,
    allParams: Object.fromEntries(url.searchParams.entries())
  });
  
  // Возвращаем HTML страницу с сообщением об успешной оплате
  // Пользователь увидит это в браузере после оплаты
  const userId = shpUserId || invId?.split('')[0] || '';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Оплата успешна</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #4CAF50; margin: 0 0 20px 0; }
        p { color: #666; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Оплата успешна!</h1>
        <p>Ваш платеж обработан успешно.</p>
        <p>Вы можете закрыть это окно и вернуться в Telegram бот.</p>
        ${userId ? `<script>setTimeout(() => { window.close(); }, 3000);</script>` : ''}
      </div>
    </body>
    </html>
  `;
  
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

export async function POST(req: Request) {
  return GET(req);
}
