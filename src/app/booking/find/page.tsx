import type { Metadata } from "next";
import Link from "next/link";
import { FindBookingForm } from "@/components/FindBookingForm";
import { BrandPage, PageIntro } from "@/components/landing/BrandPage";

export const metadata: Metadata = { title: "Find your booking", robots: { index: false } };

export default function FindBookingPage() {
  return (
    <BrandPage>
      <div className="o26-wrap flex w-full flex-wrap items-start gap-[clamp(28px,4vw,64px)] px-6 pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,88px)]">
        <div className="min-w-0 flex-[1_1_380px]">
          <PageIntro
            eyebrow="ONE·26 · Your tickets"
            title={<>Find your <span className="o26-hot">booking</span></>}
            lead="Lost the email? Enter your booking code and email to see your tickets."
          />
        </div>
        <section className="o26-card min-w-0 flex-[1_1_380px] p-[clamp(22px,3vw,36px)]">
          <FindBookingForm />
          <p className="mb-0 mt-6 text-center text-sm">
            Not booked yet? <Link href="/register" className="font-semibold underline">Save your seat</Link>
          </p>
        </section>
      </div>
    </BrandPage>
  );
}
