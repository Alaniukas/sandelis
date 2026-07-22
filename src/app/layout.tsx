import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Sandėlio WMS — EXPO / DILED",
  description: "Vidinė sandėlio valdymo sistema",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full text-stone-900 antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
