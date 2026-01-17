import { redirect } from "next/navigation";
import { isDebugBypassEnabled } from "./lib/debugBypass";
import { createServerSupabaseClient } from "../lib/supabaseAdmin";

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
  
  // If id is passed, check onboarding status and redirect appropriately
  if (typeof idValue === "string" && idValue.length > 0) {
    const numericId = Number(idValue);
    
    // Only check onboarding if id is valid number
    if (Number.isFinite(numericId) && numericId > 0) {
      try {
        const supabase = createServerSupabaseClient();
        const { data: user } = await supabase
          .from("users")
          .select("privacy_accepted, terms_accepted, calories")
          .eq("id", numericId)
          .maybeSingle();

        if (user) {
          const hasConsent = user.privacy_accepted === true && user.terms_accepted === true;
          const profileComplete = user.calories !== null && user.calories !== undefined && Number(user.calories) > 0;

          // If user is fully onboarded, redirect to main app (profile)
          if (hasConsent && profileComplete) {
            const debugParams = debugEnabled && urlParams.toString() ? `&${urlParams.toString()}` : '';
            redirect(`/profile?id=${idValue}${debugParams}` as any);
          }
          
          // If consent missing, redirect to consent
          if (!hasConsent) {
            const debugParams = debugEnabled && urlParams.toString() ? `&${urlParams.toString()}` : '';
            redirect(`/privacy/consent?id=${idValue}${debugParams}` as any);
          }
          
          // If profile incomplete, redirect to registration
          if (!profileComplete) {
            const debugParams = debugEnabled && urlParams.toString() ? `&${urlParams.toString()}` : '';
            redirect(`/registration?id=${idValue}${debugParams}` as any);
          }
        }
      } catch (error) {
        // On error, fall through to default registration redirect
        console.error("[page.tsx] Error checking onboarding:", error);
      }
    }
    
    // Fallback: redirect to registration if id is invalid or check failed
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
