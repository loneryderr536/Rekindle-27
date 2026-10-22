import type { Metadata } from "next";
import { ConfirmPayment } from "@/components/ConfirmPayment";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false } };

export default function SuccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <ConfirmPayment />
    </main>
  );
}
