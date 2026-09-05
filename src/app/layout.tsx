import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Gruppo P&C — prototipo",
  description: "Prototipo del nuovo CRM per Gruppo P&C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
