"use client";

/**
 * Helper to append ?id=... to a path from current search params
 */
export function withUserId(path: string, currentUserId: string | null): string {
  if (!currentUserId) return path;
  
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}id=${currentUserId}`;
}
