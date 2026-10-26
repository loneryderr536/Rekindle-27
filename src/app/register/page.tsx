import type { Metadata } from "next";
import Link from "next/link";
import { BookingApp } from "@/components/BookingApp";
import { EVENT } from "@/lib/event";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="relative overflow-hidden bg-plum px-4 pb-10 pt-8 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-48 max-w-2xl rounded-[50%] bg-marigold/35 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl">
          <Link href="/" className="mb-4 inline-block text-sm font-semibold text-white/80 underline">
            ← Back to {EVENT.name}
          </Link>
          <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl">{EVENT.name}</h1>
          <p className="mt-3 text-lg text-white/90">{EVENT.date}</p>
          <p className="text-white/75">{EVENT.venue}</p>
          <Link href="/booking/find" className="mt-4 inline-block text-sm font-semibold text-white underline">
            Already booked? Find your tickets
          </Link>
        </div>
      </header>
      <BookingApp />
    </main>
  );
}
