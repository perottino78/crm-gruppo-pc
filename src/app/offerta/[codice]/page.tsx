// Link per il cliente (dall'email "Invia offerta"): mostra l'offerta come la stampa, con il pulsante Stampa / Salva PDF.
// Non serve accedere al CRM: il codice è firmato (id + firma), quindi non si possono aprire altre offerte cambiando l'id.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { leggiCodiceOfferta } from "@/lib/mail/link-offerta";
import StampaOfferta from "@/components/preventivi/StampaOfferta";

export const metadata: Metadata = { title: "La sua offerta — Gruppo P&C", robots: { index: false, follow: false } };

export default async function OffertaClientePage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const id = leggiCodiceOfferta(codice);
  if (!id) notFound();
  const p = await prisma.preventivo.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
  if (!p) notFound();
  // conta le aperture del cliente (non quelle di chi lavora nel CRM e controlla il link)
  if (!(await getCurrentUser())) {
    await prisma.preventivo.update({ where: { id }, data: { vistoIl: new Date(), visite: { increment: 1 } } }).catch(() => {});
  }
  return <StampaOfferta id={id} scope={{}} />;
}
