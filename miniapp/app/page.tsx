import { redirect } from "next/navigation";
import { isDebugBypassEnabled } from "./lib/debugBypass";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams
}: {
  searchParams?: { id?: string | string[]; debug?: string; debugKey?: string };
}) {
  const id = searchParams?.id;
  const idValue = Array.isArray(id) ? id[0] : id;
  
  // Check for debug bypass
  const urlParams = new URLSearchParams();
  if (searchParams?.debug) urlParams.set("debug", searchParams.debug);
  if (searchParams?.debugKey) urlParams.set("debugKey", searchParams.debugKey);
  
  const debugEnabled = isDebugBypassEnabled(urlParams);
  
  // If id is passed and debug is enabled, allow access
  if (typeof idValue === "string" && idValue.length > 0) {
    if (debugEnabled) {
      redirect(`/registration?id=${idValue}${urlParams.toString() ? `&${urlParams.toString()}` : ''}` as any);
    } else {
      redirect(`/registration?id=${idValue}` as any);
    }
  }
  
  // If debug bypass is enabled, show debug info page
  if (debugEnabled) {
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
        <h1>Step One - Debug Mode</h1>
        <p style={{ color: 'green', marginTop: '10px' }}>✓ Debug bypass enabled</p>
        <p style={{ marginTop: '20px' }}>Add ?id=USER_ID to access the app</p>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          Example: /?debug=1&debugKey=YOUR_KEY&id=123
        </p>
      </div>
    );
  }
  
  // If id не передан - показываем простую страницу вместо ошибки 400
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
