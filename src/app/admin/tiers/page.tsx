import type { Metadata } from "next";
import { TiersAdmin } from "@/components/TiersAdmin";
import { requireAdminPage } from "@/server/auth/guard";
import { listSeats } from "@/server/seats/listSeats";

export const metadata: Metadata = { title: "Tiers", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  await requireAdminPage(["admin"]);
  const { tiers } = await listSeats();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-plum">Tiers &amp; prices</h1>
      <TiersAdmin tiers={tiers} />
    </main>
  );
}
