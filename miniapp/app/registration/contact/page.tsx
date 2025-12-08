"use server";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RegistrationContactRedirect({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const query = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        value.forEach((v) => query.append(key, v));
      } else if (value !== undefined) {
        query.set(key, value);
      }
    }
  }

  const target = query.toString() ? `/registration?${query.toString()}` : "/registration";
  redirect(target);
}


