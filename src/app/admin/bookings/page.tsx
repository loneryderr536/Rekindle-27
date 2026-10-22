import type { Metadata } from "next";
import { BookingsTable } from "@/components/BookingsTable";
import { searchBookings } from "@/server/admin/bookings";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminBookings({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdminPage(["admin"]);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const rows = q.length >= 2 ? await searchBookings(q) : [];
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-plum">Bookings</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="field min-w-64 flex-1">
          <span>Find a booking</span>
          <input name="q" defaultValue={q} placeholder="Code, email, phone or name" maxLength={100} />
        </label>
        <button type="submit" className="btn-primary">Search</button>
      </form>
      {q.length === 0 ? null : q.length < 2 ? (
        <p className="text-muted">Type at least 2 characters.</p>
      ) : (
        <BookingsTable rows={rows} empty={`No bookings match "${q}".`} />
      )}
    </main>
  );
}
