import type { Metadata } from "next";
import Link from "next/link";
import { BookingsTable } from "@/components/BookingsTable";
import { formatInr } from "@/lib/money";
import { getDashboard } from "@/server/admin/dashboard";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdminPage(["admin"]);
  const d = await getDashboard();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-bold text-plum">Dashboard</h1>
        {/* Plain link: the response is a file download, not a page. */}
        <a href="/api/admin/export" className="btn-ghost" download>
          Export CSV
        </a>
      </header>

      <section aria-label="Revenue" className="rounded-xl bg-plum p-5 text-white">
        <p className="text-sm text-white/70">Revenue (paid bookings)</p>
        <p className="font-display text-4xl font-bold text-marigold">{formatInr(d.revenuePaise)}</p>
      </section>

      <section aria-labelledby="tiers-h" className="space-y-3">
        <h2 id="tiers-h" className="text-lg font-bold">Seats by tier</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3">Tier</th>
                <th className="p-3 text-right">Available</th>
                <th className="p-3 text-right">Held</th>
                <th className="p-3 text-right">Sold</th>
                <th className="p-3 text-right">Comp</th>
                <th className="p-3 text-right">Blocked</th>
              </tr>
            </thead>
            <tbody>
              {d.tiers.map((t) => (
                <tr key={t.name} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 font-semibold">{t.name}</th>
                  <td className="p-3 text-right tabular-nums">{t.available}</td>
                  <td className="p-3 text-right tabular-nums">{t.held}</td>
                  <td className="p-3 text-right tabular-nums">{t.sold}</td>
                  <td className="p-3 text-right tabular-nums">{t.comp}</td>
                  <td className="p-3 text-right tabular-nums">{t.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="recent-h" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-h" className="text-lg font-bold">Recent bookings</h2>
          <Link href="/admin/bookings" className="text-sm font-semibold underline">Search bookings</Link>
        </div>
        <BookingsTable rows={d.recent} empty="No bookings yet." />
      </section>
    </main>
  );
}
