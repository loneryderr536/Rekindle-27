import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { denied } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="font-display mb-1 text-3xl font-bold text-plum">Staff sign in</h1>
      <p className="mb-6 text-muted">Box office and gate staff only.</p>
      <div className="ticket-stub">
        <div className="pt-4">
          <AdminLoginForm denied={denied === "1"} />
        </div>
      </div>
    </main>
  );
}
