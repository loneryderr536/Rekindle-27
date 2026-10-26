import type { Metadata } from "next";
import Link from "next/link";
import { AttendeeForm } from "@/components/AttendeeForm";
import { BrandPage, PageIntro, RegisterSteps } from "@/components/landing/BrandPage";
import { LINKS } from "@/components/landing/links";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <BrandPage>
      <div className="o26-wrap flex w-full flex-wrap items-start gap-[clamp(28px,4vw,64px)] px-6 pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,88px)]">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
          <RegisterSteps current={1} />
          <PageIntro
            eyebrow="ONE·26 · Registration"
            title={<>Save your <span className="o26-hot">seat</span></>}
            lead="Tell us who's coming and how many of you there are. Next you'll pick your seats on the map, then pay to confirm."
          />
          <blockquote className="o26-quote o26-ff-fredoka">
            “Stir up the gift of God, which is in thee.”
            <cite className="o26-ff-poppins">2 TIMOTHY 1:6</cite>
          </blockquote>
          <Link href={LINKS.findBooking} className="text-sm font-semibold underline">
            Already booked? Find your tickets
          </Link>
        </div>
        <section className="o26-card min-w-0 flex-[1_1_420px] p-[clamp(22px,3vw,36px)]" aria-labelledby="details-h">
          <h2 id="details-h" className="font-display m-0 mb-5 text-3xl font-semibold">Your details</h2>
          <AttendeeForm />
        </section>
      </div>
    </BrandPage>
  );
}
