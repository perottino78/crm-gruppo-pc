import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NOME_APP, MOTTO, ARANCIO } from "@/lib/marchio";

export const metadata: Metadata = {
  title: { default: NOME_APP, template: `%s · ${NOME_APP}` },
  description: `${NOME_APP} — il gestionale del Gruppo P&C. ${MOTTO}`,
  applicationName: NOME_APP,
  appleWebApp: { capable: true, title: NOME_APP, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: ARANCIO };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
