import type { Metadata } from "next";
import { ConfirmPayment } from "@/components/ConfirmPayment";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false } };

/** Just the loading screen: no header or footer while the payment is confirmed. */
export default function SuccessPage() {
  return <ConfirmPayment />;
}
