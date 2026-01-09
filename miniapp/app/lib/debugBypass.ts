/**
 * Debug bypass utility for allowing browser access with debug key
 */

export function isDebugBypassEnabled(searchParams: URLSearchParams): boolean {
  const debug = searchParams.get("debug");
  const debugKey = searchParams.get("debugKey");
  
  if (debug !== "1" || !debugKey) {
    return false;
  }
  
  // Check against environment variable
  const expectedKey = process.env.NEXT_PUBLIC_DEBUG_KEY || process.env.DEBUG_KEY;
  
  if (!expectedKey) {
    return false;
  }
  
  return debugKey === expectedKey;
}
