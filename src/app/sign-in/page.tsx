import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GuestSignIn } from "@/components/GuestSignIn";
import { BrandPage, PageIntro } from "@/components/landing/BrandPage";
import { safeNext } from "@/lib/safeNext";
import { getGuest } from "@/server/guestAuth/getGuest";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignInPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getGuest()) redirect(next);

  return (
    <BrandPage>
      <div className="o26-wrap flex w-full flex-wrap items-start gap-[clamp(28px,4vw,64px)] px-6 pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,88px)]">
        <div className="min-w-0 flex-[1_1_380px]">
          <PageIntro eyebrow="ONE·26 · Your tickets" title="Sign in" />
        </div>
        <section className="o26-card min-w-0 flex-[1_1_380px] p-[clamp(22px,3vw,36px)]">
          {first(sp.error) === "google" && (
            <p role="alert" className="mt-0 text-sm text-danger">
              Google sign-in didn&apos;t finish. Try again or use an email code.
            </p>
          )}
          <GuestSignIn next={next} />
        </section>
      </div>
    </BrandPage>
  );
}
