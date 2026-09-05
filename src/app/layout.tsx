import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AccentBar from "@/components/AccentBar";

export const metadata: Metadata = {
  title: "CRM Gruppo P&C — prototipo",
  description: "Prototipo del nuovo CRM per Gruppo P&C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased bg-neutral-50 text-neutral-900">
        <div className="flex min-h-screen">
          <Suspense fallback={<div className="w-56 shrink-0 border-r border-neutral-200 bg-white" />}>
            <Sidebar />
          </Suspense>
          <div className="flex-1 flex flex-col min-w-0">
            <Suspense fallback={<div className="h-1.5 w-full" />}>
              <AccentBar />
            </Suspense>
            <main className="flex-1 p-8 print:p-0">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
