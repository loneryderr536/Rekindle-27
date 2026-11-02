import type { Metadata } from "next";
import { SeatDesigner } from "@/components/SeatDesigner";
import { listSeats } from "@/server/seats/listSeats";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Seat designer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SeatDesignerPage() {
  await requireAdminPage(["admin"]);
  const initial = await listSeats();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-plum">Seat designer</h1>
        <p className="text-muted">Lay out the venue visually instead of editing a CSV.</p>
      </header>
      <SeatDesigner initial={initial} />
    </main>
  );
}
