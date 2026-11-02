export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
import { brandInfo } from "@/lib/brands";
import { APP_URL } from "@/lib/mail/invio";
import { rimbalzato } from "@/lib/campagne/motore";
import { firmaDi, testoOffertaPredefinito, oggettoOffertaPredefinito } from "@/lib/mail/firma";
import EditorInvioOfferta from "@/components/preventivi/EditorInvioOfferta";

export default async function InviaOffertaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ errore?: string }> }) {
  const { id } = await params;
  const { errore } = await searchParams;
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const p = await prisma.preventivo.findFirst({
    where: { id, ...scopePreventivoWhere(u) },
    include: { cliente: true, brand: true, commerciale: { select: { email: true } } },
  });
  if (!p) notFound();
  const numero = `${p.numeroOfferta ?? p.id.slice(-6).toUpperCase()}/${p.createdAt.getFullYear()}`;
  const info = brandInfo(p.brand?.nome);
  const documenti = await prisma.documento.findMany({
    where: { OR: [{ entita: "PREVENTIVO", entitaId: p.id }, { entita: "CLIENTE", entitaId: p.clienteId }] },
    select: { id: true, nome: true, cartella: true, entita: true, dimensione: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const cc = p.commerciale?.email && p.commerciale.email.toLowerCase() !== u.email.toLowerCase() ? p.commerciale.email : "";
  const personale = !!(u.smtpUtente && u.smtpPassword);
  const avviso = !p.cliente.email
    ? "Nella scheda del cliente non c'è l'email: scrivila qui, verrà salvata anche nella scheda."
    : rimbalzato(p.cliente) ? `L'ultima email a ${p.cliente.email} è tornata indietro (${p.cliente.rimbalzoMotivo ?? "non recapitata"}): controlla l'indirizzo.` : null;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href={`/preventivi/${p.id}`} className="text-sm text-blue-800 underline">← Offerta n. {numero}</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">✉️ Invia offerta a {p.cliente.nome}</h1>
        <p className="text-sm text-neutral-600">Controlla il testo, la tua firma e gli allegati, poi premi «Invia offerta». L&apos;email resta nello storico dell&apos;offerta.</p>
      </div>
      {errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{errore}</p>}
      <EditorInvioOfferta
        id={p.id}
        a={p.cliente.email ?? ""}
        cc={cc}
        oggetto={oggettoOffertaPredefinito(numero, p.brand?.nome)}
        testo={testoOffertaPredefinito({ cliente: p.cliente.nome, numero, oggetto: p.oggetto })}
        firma={firmaDi(u, p.brand?.nome)}
        firmaSalvata={!!u.firmaEmail?.trim()}
        colore={info.primary}
        logo={info.logoUrl ? `${APP_URL}${info.logoUrl}` : null}
        documenti={documenti.map((d) => ({ id: d.id, nome: d.nome, cartella: d.cartella, dove: d.entita === "CLIENTE" ? "Cliente" : "Offerta", kb: Math.max(1, Math.round(d.dimensione / 1024)) }))}
        avviso={avviso}
        mittente={personale ? `la tua casella (${u.smtpUtente})` : "la casella aziendale, con le risposte a te"}
      />
    </div>
  );
}
