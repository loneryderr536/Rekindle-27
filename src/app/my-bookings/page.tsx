import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyBookingCard } from "@/components/MyBookingCard";
import { SignOutButton } from "@/components/SignOutButton";
import { BrandPage, PageIntro } from "@/components/landing/BrandPage";
import { listGuestBookings } from "@/server/bookings/listGuestBookings";
import { getGuest } from "@/server/guestAuth/getGuest";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ new?: string | string[] }> };

export default async function MyBookingsPage({ searchParams }: Props) {
  const guest = await getGuest();
  if (!guest) redirect("/sign-in?next=/my-bookings");

  const sp = await searchParams;
  // Display-only: it just picks which card to feature.
  const justBooked = Array.isArray(sp.new) ? sp.new[0] : sp.new;
  const all = await listGuestBookings(guest.email);
  const bookings = [...all.filter((b) => b.publicCode === justBooked), ...all.filter((b) => b.publicCode !== justBooked)];

  return (
    <BrandPage current="my-bookings">
      <section className="mx-auto w-full max-w-xl px-6 pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,72px)]">
        <PageIntro eyebrow="ONE·26 · Your tickets" title={<>My <span className="o26-hot">bookings</span></>} />
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <p className="m-0 min-w-0 break-all">Signed in as <strong>{guest.email}</strong></p>
          <SignOutButton />
        </div>
        {bookings.length === 0 ? (
          <div className="o26-card mt-8 p-6 text-center">
            <p className="mt-0">No bookings yet for this email</p>
            <Link href="/register" className="btn-primary inline-block">Save your seat</Link>
          </div>
        ) : (
          <ul className="m-0 mt-8 flex list-none flex-col gap-5 p-0">
            {bookings.map((b) => (
              <MyBookingCard key={b.id} booking={b} highlight={b.publicCode === justBooked} />
            ))}
          </ul>
        )}
      </section>
    </BrandPage>
  );
}
