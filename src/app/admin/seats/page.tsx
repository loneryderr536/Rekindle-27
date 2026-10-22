import type { Metadata } from "next";
import { AdminSeats } from "@/components/AdminSeats";
import { requireAdminPage } from "@/server/auth/guard";
import { listSeats } from "@/server/seats/listSeats";

export const metadata: Metadata = { title: "Seats", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminSeatsPage() {
  await requireAdminPage(["admin"]);
  const initial = await listSeats();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-plum">Seats</h1>
      <AdminSeats initial={initial} />
    </main>
  );
}
