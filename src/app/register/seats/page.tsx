import type { Metadata } from "next";
import { BrandPage } from "@/components/landing/BrandPage";
import { SeatsStep } from "@/components/SeatsStep";

export const metadata: Metadata = { title: "Confirm & pay", robots: { index: false } };

export default function SeatsPage() {
  // No footer: once a hold exists this step shows a fixed bar at the bottom.
  return (
    <BrandPage footer={false} dark="seats">
      <SeatsStep />
    </BrandPage>
  );
}
