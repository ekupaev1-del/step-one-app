import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams
}: {
  searchParams?: { id?: string | string[] };
}) {
  const id = searchParams?.id;
  const idValue = Array.isArray(id) ? id[0] : id;
  const target =
    typeof idValue === "string" && idValue.length > 0
      ? `/registration?id=${idValue}`
      : "/registration";

  redirect(target as any);
}
