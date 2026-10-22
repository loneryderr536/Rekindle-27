import Link from "next/link";
import { formatIst } from "@/lib/istTime";
import { formatInr } from "@/lib/money";
import type { BookingSummary } from "@/server/admin/dashboard";

export function BookingsTable({ rows, empty }: { rows: BookingSummary[]; empty: string }) {
  if (rows.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th className="p-3">Code</th>
            <th className="p-3">Name</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Seats</th>
            <th className="p-3 text-right">Amount</th>
            <th className="p-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="p-3 font-mono font-semibold">
                <Link href={`/admin/bookings/${r.id}`} className="underline">{r.publicCode}</Link>
              </td>
              <td className="p-3">{r.name}</td>
              <td className="p-3">{r.status}</td>
              <td className="p-3 text-right tabular-nums">{r.seatCount}</td>
              <td className="p-3 text-right tabular-nums">{formatInr(r.amountPaise)}</td>
              <td className="p-3 whitespace-nowrap">{formatIst(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
