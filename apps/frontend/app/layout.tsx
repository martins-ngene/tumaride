import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { homeModel } from "@/features/home/home.model";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/Manrope-Variable.ttf",
  variable: "--font-manrope",
  weight: "500 800",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/DM-Sans-Variable.ttf",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
});

export const metadata: Metadata = {
  title: homeModel.name,
  description: homeModel.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
