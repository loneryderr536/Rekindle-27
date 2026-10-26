import type { Metadata } from "next";
import { ConfirmPayment } from "@/components/ConfirmPayment";
import { BrandPage } from "@/components/landing/BrandPage";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false } };

export default function SuccessPage() {
  return (
    <BrandPage>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <ConfirmPayment />
      </div>
    </BrandPage>
  );
}
