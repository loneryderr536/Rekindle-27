import type { Metadata } from "next";
import { BrandPage } from "@/components/landing/BrandPage";
import { SeatsStep } from "@/components/SeatsStep";

export const metadata: Metadata = { title: "Pick your seats", robots: { index: false } };

export default function SeatsPage() {
  // No footer: the seat step has a fixed bar at the bottom.
  return (
    <BrandPage footer={false}>
      <SeatsStep />
    </BrandPage>
  );
}
