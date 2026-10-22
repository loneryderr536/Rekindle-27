import { jsonError } from "@/lib/errors";
import { logAudit } from "@/server/admin/audit";
import { exportCsv } from "@/server/admin/export";
import { requireRole } from "@/server/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 330 * 60_000;

export async function GET(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const csv = await exportCsv();
    await logAudit(session.adminUserId, "export_csv", {});
    const day = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10).replaceAll("-", "");
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookings-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
