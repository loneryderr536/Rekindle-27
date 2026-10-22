import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db/client";
import { adminUsers, auditLog } from "@/db/schema";
import { formatIst } from "@/lib/istTime";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdminPage(["admin"]);
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.createdAt, action: auditLog.action, details: auditLog.details, email: adminUsers.email })
    .from(auditLog)
    .leftJoin(adminUsers, eq(adminUsers.id, auditLog.adminUserId))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-plum">Audit log</h1>
      {rows.length === 0 ? (
        <p className="text-muted">Nothing has been recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr><th className="p-3">Time (IST)</th><th className="p-3">Admin</th><th className="p-3">Action</th><th className="p-3">Details</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatIst(r.at)}</td>
                  <td className="p-3">{r.email ?? "unknown"}</td>
                  <td className="p-3 font-mono font-semibold">{r.action}</td>
                  <td className="p-3"><pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.details, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
