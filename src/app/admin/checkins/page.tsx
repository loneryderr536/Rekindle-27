import type { Metadata } from "next";
import { CheckinsDashboard } from "@/components/CheckinsDashboard";
import { getCheckinDashboard } from "@/server/admin/checkins";
import { requireAdminPage } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Check-ins", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckinsPage() {
  await requireAdminPage(["admin"]);
  const initial = await getCheckinDashboard();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-plum">Check-ins</h1>
        <p className="text-muted">Live progress across every gate.</p>
      </header>
      <CheckinsDashboard initial={initial} />
    </main>
  );
}
