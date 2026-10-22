import type { Metadata } from "next";
import { ScanStation } from "@/components/ScanStation";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Gate scanner", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireAdminPage(["admin", "scanner"]);
  return <ScanStation />;
}
