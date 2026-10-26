import type { Metadata, Viewport } from "next";
import { fredoka, poppins } from "@/components/landing/fonts";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { RevealFallback } from "@/components/landing/RevealFallback";
import { AboutSection, FaqSection, LandingFooter, PlanSection, RekindleSection } from "@/components/landing/Sections";
import { Stats } from "@/components/landing/Stats";
import { StoryIntro } from "@/components/landing/StoryIntro";
import { countSeats } from "@/server/seats/countSeats";
import "./landing.css";

export const dynamic = "force-dynamic";

/** Midnight IST on the night itself; drives the "Days to go" count. */
const EVENT_DAY = new Date("2027-01-26T00:00:00+05:30").getTime();

function daysToGo(now: number = Date.now()): number {
  return Math.max(0, Math.ceil((EVENT_DAY - now) / 86400000));
}

export const metadata: Metadata = {
  title: { absolute: "ONE·26 Rekindle" },
  description:
    "ONE·26 Rekindle — an evening of worship, Scripture and live music on 26 January 2027, presented by the Christos Marthoma Yuvajana Sakyam & Young Family Fellowship.",
};

export const viewport: Viewport = { themeColor: "#0B1020", viewportFit: "cover" };

export default async function Home() {
  // The landing page still renders if the database is unreachable; the seat stat just shows a dash.
  const seats = await countSeats().catch(() => null);
  const days = daysToGo();
  return (
    <div id="o26-root" className={`${fredoka.variable} ${poppins.variable}`}>
      <LandingHeader />
      <main>
        <StoryIntro />
        <RekindleSection />
        <AboutSection />
        <Stats days={days} seats={seats} />
        <PlanSection />
        <FaqSection />
      </main>
      <LandingFooter />
      <RevealFallback />
    </div>
  );
}
