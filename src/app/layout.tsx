import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TelemetryProvider } from "@/context/TelemetryContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SenseGrid AI — Adaptive Industrial HMI",
  description: "Adaptive Human-Machine Interface for predictive maintenance and operator load monitoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TelemetryProvider>{children}</TelemetryProvider>
      </body>
    </html>
  );
}
