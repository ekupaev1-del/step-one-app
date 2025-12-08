"use server";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const id = searchParams?.id;
  const target =
    typeof id === "string" && id.length > 0
      ? `/registration?id=${id}`
      : "/registration";

  redirect(target);
}
