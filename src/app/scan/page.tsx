import type { Metadata } from "next";
import { ScanStation } from "@/components/ScanStation";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Gate scanner", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireAdminPage(["admin", "scanner"]);
  return (
    <div id="o26-root" className="flex flex-1 flex-col">
      <div className="o26-glass" aria-hidden="true" />
      <ScanStation />
    </div>
  );
}
