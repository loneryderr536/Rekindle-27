import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ResendTicketsButton } from "@/components/ResendTicketsButton";
import { bookingStatusLabel } from "@/lib/bookingStatus";
import { formatIst } from "@/lib/istTime";
import { formatInr } from "@/lib/money";
import { getBookingDetail } from "@/server/admin/bookings";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminBookingDetail({ params }: PageProps<"/admin/bookings/[id]">) {
  await requireAdminPage(["admin"]);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const b = await getBookingDetail(id.data);
  if (!b) notFound();
  const resendable = b.status === "paid" || b.status === "comp";
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <Link href="/admin/bookings" className="text-sm font-semibold underline">All bookings</Link>
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold text-plum">
          Booking <span className="font-mono">{b.publicCode}</span>
        </h1>
        <p className="text-muted">
          {bookingStatusLabel(b.status)} ({b.status}) · {formatInr(b.amountPaise)}
        </p>
      </header>

      <section aria-labelledby="guest-h" className="space-y-2 rounded-xl border border-line bg-white p-4">
        <h2 id="guest-h" className="font-bold">Guest</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Name</dt><dd>{b.name}</dd>
          <dt className="text-muted">Email</dt><dd className="break-all">{b.email}</dd>
          <dt className="text-muted">Phone</dt><dd>{b.phone}</dd>
          <dt className="text-muted">Booked</dt><dd>{formatIst(b.createdAt)}</dd>
          <dt className="text-muted">Paid</dt><dd>{b.paidAt ? formatIst(b.paidAt) : "Not paid"}</dd>
        </dl>
      </section>

      <section aria-labelledby="seats-h" className="space-y-3">
        <h2 id="seats-h" className="text-lg font-bold">Seats</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3">Seat</th>
                <th className="p-3">Tier</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3">Check-in</th>
                <th className="p-3">Gate</th>
              </tr>
            </thead>
            <tbody>
              {b.seats.map((s) => (
                <tr key={s.label} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 font-semibold">{s.label}</th>
                  <td className="p-3">{s.tierName}</td>
                  <td className="p-3 text-right tabular-nums">{formatInr(s.pricePaise)}</td>
                  <td className="p-3">{s.checkedInAt ? formatIst(s.checkedInAt) : "Not checked in"}</td>
                  <td className="p-3">{s.gate ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ResendTicketsButton bookingId={b.id} disabled={!resendable} />
    </main>
  );
}
