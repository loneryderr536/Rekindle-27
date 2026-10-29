import type { Metadata } from "next";
import Link from "next/link";
import { AttendeeForm } from "@/components/AttendeeForm";
import { BrandPage, RegisterSteps } from "@/components/landing/BrandPage";
import { LINKS } from "@/components/landing/links";

export const metadata: Metadata = { title: "Register" };

const row = { display: "flex", gap: 12, alignItems: "center" } as const;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}

export default function RegisterPage() {
  return (
    <BrandPage current="register">
      <section className="o26-navy" style={{ position: "relative", borderRadius: "0 0 48px 48px", padding: "clamp(36px, 5vw, 64px) 0 clamp(120px, 14vw, 180px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12, color: "#FDFBF4" }}>
          <div className="p-in p-d1"><RegisterSteps current={1} /></div>
          <span className="p-in p-d1 p-eyebrow" style={{ marginTop: 8 }}>Registration · ONE·26</span>
          <h1 className="p-in p-d2 p-h1 o26-ff-fredoka" style={{ fontSize: "clamp(44px, 6.6vw, 86px)" }}>Save your seat.</h1>
          <p className="p-in p-d3 p-lead" style={{ fontSize: "clamp(16px, 1.6vw, 19px)" }}>
            Tell us who&apos;s coming and how many of you there are. Next you&apos;ll pick your seats on the map, then pay to confirm.
          </p>
        </div>
      </section>
      <section style={{ maxWidth: 1200, margin: "clamp(-150px, -11vw, -96px) auto 0", width: "100%", padding: "0 24px clamp(56px, 7vw, 96px)", boxSizing: "border-box", position: "relative" }}>
        <div className="p-in p-d4 o26-reg-card">
          <div className="o26-reg-night">
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, color: "#F9A90B" }}>THE NIGHT</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 16 }}>
              <span style={row}>
                <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
                Tue, 26 January 2027 · [TIME]
              </span>
              <span style={row}>
                <Icon><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>
                [VENUE], [CITY]
              </span>
              <span style={row}>
                <Icon><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 11v2M13 17v2" /></Icon>
                Entry [FREE / ₹—]
              </span>
            </div>
            <div style={{ flexGrow: 1, minHeight: 12 }} />
            <div style={{ padding: "18px 20px", borderRadius: 20, background: "rgba(253, 251, 244, 0.1)", fontSize: 15, lineHeight: 1.6 }}>
              Leading the evening: <strong style={{ fontWeight: 600 }}>Immanuel Henry &amp; Unarv Band</strong>.{" "}
              <Link href={LINKS.lineup} style={{ color: "#F9A90B", fontWeight: 600 }}>See the line-up</Link>
            </div>
          </div>
          <section className="o26-reg-form" aria-labelledby="details-h">
            <h2 id="details-h" className="font-display m-0 mb-5 text-3xl font-semibold">Your details</h2>
            <AttendeeForm />
            <p className="mb-0 mt-5 text-center">
              <Link href={LINKS.findBooking} className="text-sm font-semibold underline">Already booked? Find your tickets</Link>
            </p>
          </section>
        </div>
      </section>
    </BrandPage>
  );
}
