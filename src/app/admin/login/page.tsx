import type { Metadata } from "next";
import { PageIntro } from "@/components/landing/BrandPage";
import { RoleSignIn } from "@/components/RoleSignIn";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { denied } = await searchParams;
  return (
    <div className="o26-wrap flex w-full flex-wrap items-start gap-[clamp(28px,4vw,64px)] px-6 pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,88px)]">
      <div className="min-w-0 flex-[1_1_380px]">
        <PageIntro eyebrow="ONE·26 · Sign in" title="Sign in" />
      </div>
      <section className="o26-card min-w-0 flex-[1_1_380px] p-[clamp(22px,3vw,36px)]">
        <RoleSignIn next="/my-bookings" defaultRole="admin" denied={denied === "1"} />
      </section>
    </div>
  );
}
