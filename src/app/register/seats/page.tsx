import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandPage } from "@/components/landing/BrandPage";
import { SeatsStep } from "@/components/SeatsStep";
import { getGuest } from "@/server/guestAuth/getGuest";

export const metadata: Metadata = { title: "Pick your seats", robots: { index: false } };
// Reads the guest session cookie; without this the page is prerendered at build as "signed out".
export const dynamic = "force-dynamic";

export default async function SeatsPage() {
  // The proxy redirects signed-out guests; this covers a session that expired mid-request.
  const guest = await getGuest();
  if (!guest) redirect("/register");
  // No footer: the seat step has a fixed bar at the bottom.
  return (
    <BrandPage footer={false} dark="seats">
      <SeatsStep guestEmail={guest.email} />
    </BrandPage>
  );
}
