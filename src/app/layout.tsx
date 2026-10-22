import type { Metadata, Viewport } from "next";
import { EVENT } from "@/lib/event";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${EVENT.name} tickets`, template: `%s | ${EVENT.name}` },
  description: `Choose your seats for ${EVENT.name}, ${EVENT.date}, ${EVENT.venue}.`,
};

export const viewport: Viewport = { themeColor: "#2b1433" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
