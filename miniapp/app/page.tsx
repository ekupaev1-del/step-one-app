import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams
}: {
  searchParams?: { id?: string | string[] };
}) {
  // Если это редирект от Robokassa после оплаты - обрабатываем по-другому
  const id = searchParams?.id;
  const idValue = Array.isArray(id) ? id[0] : id;
  
  // Если id передан - редиректим на регистрацию
  if (typeof idValue === "string" && idValue.length > 0) {
    redirect(`/registration?id=${idValue}` as any);
  }
  
  // Если id не передан - показываем простую страницу вместо ошибки 400
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1>Step One</h1>
      <p>Откройте приложение через Telegram бота</p>
    </div>
  );
}
