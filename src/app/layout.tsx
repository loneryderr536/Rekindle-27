import type { Metadata, Viewport } from "next";
import { fredoka, poppins } from "@/components/landing/fonts";
import { EVENT } from "@/lib/event";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  title: { default: `${EVENT.name} tickets`, template: `%s | ${EVENT.name}` },
  description: `Choose your seats for ${EVENT.name}, ${EVENT.date}, ${EVENT.venue}.`,
};

export const viewport: Viewport = { themeColor: "#0B1020" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
