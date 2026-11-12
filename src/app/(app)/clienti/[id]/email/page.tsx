export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import { brandInfo } from "@/lib/brands";
import { APP_URL } from "@/lib/mail/invio";
import { rimbalzato } from "@/lib/campagne/motore";
import { firmaDi } from "@/lib/mail/firma";
import EditorEmailCliente from "@/components/clienti/EditorEmailCliente";

// Email al cliente scritta dentro P&C ONE (non nel programma di posta del computer).
export default async function EmailClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ errore?: string; oggetto?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const c = await prisma.cliente.findFirst({ where: { id, ...scopeClienteWhere(u) }, include: { brand: true } });
  if (!c) notFound();
  const offerte = await prisma.preventivo.findMany({ where: { clienteId: c.id }, select: { id: true, numeroOfferta: true } });
  const numeri = new Map(offerte.map((o) => [o.id, o.numeroOfferta]));
  const documenti = await prisma.documento.findMany({
    where: { OR: [{ entita: "CLIENTE", entitaId: c.id }, { entita: "PREVENTIVO", entitaId: { in: offerte.map((o) => o.id) } }] },
    select: { id: true, nome: true, cartella: true, entita: true, entitaId: true, dimensione: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const info = brandInfo(c.brand?.nome);
  const personale = !!(u.smtpUtente && u.smtpPassword);
  const nome = c.nome.split(/\s+/).length > 1 ? "" : c.nome;
  const avviso = !c.email
    ? "Nella scheda del cliente non c'è l'email: scrivila qui, verrà salvata anche nella scheda."
    : rimbalzato(c) ? `L'ultima email a ${c.email} è tornata indietro (${c.rimbalzoMotivo ?? "non recapitata"}): controlla l'indirizzo.` : null;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href={`/clienti/${c.id}`} className="btn-indietro">← {c.nome}</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">✉️ Email a {c.nome}</h1>
        <p className="text-sm text-neutral-600">
          Scrivi e invia da qui: parte dalla tua casella con la tua firma e resta nelle attività del cliente.
          {c.email && <> Preferisci il programma di posta del computer? <a href={`mailto:${c.email}`} className="underline">apri lì</a>.</>}
        </p>
      </div>
      {sp.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{sp.errore}</p>}
      <EditorEmailCliente
        clienteId={c.id}
        a={c.email ?? ""}
        cc=""
        oggetto={sp.oggetto ?? ""}
        testo={`Gentile ${nome || "Cliente"},\n\n\n\nCordiali saluti`}
        firma={firmaDi(u, c.brand?.nome)}
        firmaSalvata={!!u.firmaEmail?.trim()}
        colore={info.primary}
        logo={info.logoUrl ? `${APP_URL}${info.logoUrl}` : null}
        documenti={documenti.map((d) => ({ id: d.id, nome: d.nome, cartella: d.cartella, dove: d.entita === "CLIENTE" ? "Cliente" : `Offerta${numeri.get(d.entitaId) ? ` n. ${numeri.get(d.entitaId)}` : ""}`, kb: Math.max(1, Math.round(d.dimensione / 1024)) }))}
        avviso={avviso}
        mittente={personale ? `la tua casella (${u.smtpUtente})` : "la casella aziendale, con le risposte a te"}
      />
    </div>
  );
}
