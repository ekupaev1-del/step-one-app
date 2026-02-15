"use client";

import { ReactNode } from "react";
import { UserSessionProvider } from "./UserSessionProvider";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <UserSessionProvider>{children}</UserSessionProvider>;
}
