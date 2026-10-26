import type { Metadata } from "next";
import Link from "next/link";
import { FindBookingForm } from "@/components/FindBookingForm";

export const metadata: Metadata = { title: "Find your booking", robots: { index: false } };

export default function FindBookingPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="font-display mb-1 text-3xl font-bold text-plum">Find your booking</h1>
      <p className="mb-6 text-muted">Lost the email? Enter your booking code and email to see your tickets.</p>
      <FindBookingForm />
      <Link href="/register" className="mt-6 text-center text-sm font-semibold underline">Back to seats</Link>
    </main>
  );
}
