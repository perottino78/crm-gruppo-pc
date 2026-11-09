export const dynamic = "force-dynamic";

import { puo } from "@/lib/permessi/catalogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeLeadWhere } from "@/lib/scope";
import { chiaveGiorno, inizioGiorno, aggiungiGiorni } from "@/lib/calendario/tempo";
import { FASI_LEAD, FASI_APERTE } from "@/lib/automazioni/percorsi";
import { statoAutomazioni } from "@/lib/automazioni/motore";

type P = { vista?: string; id?: string; q?: string; fatto?: string; errore?: string; ok?: string; fase?: string };
const inp = "border border-neutral-300 rounded-md px-2 py-1.5 text-sm";
const ora = (d: Date) => d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit" });

const SELEZIONE = {
  id: true, nome: true, telefono: true, fase: true, scadenzaAzione: true, prodotto: true, comune: true, createdAt: true, nonGestitoIl: true,
  brand: { select: { nome: true } }, telefonista: { select: { nome: true } },
} satisfies Prisma.LeadSelect;
type Riga = Prisma.LeadGetPayload<{ select: typeof SELEZIONE }>;

/** Lead da lavorare: i task di oggi (più quelli rimasti indietro) in un elenco compatto; ogni riga apre la pagina dedicata del lead. */
export default async function LeadPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  // vecchi link (/lead?id=…, anche nelle email): vanno alla pagina dedicata
  if (p.id) {
    const resto = new URLSearchParams(Object.entries({ errore: p.errore, ok: p.ok, fatto: p.fatto }).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/lead/${encodeURIComponent(p.id)}${resto ? `?${resto}` : ""}`);
  }
  const u = await getCurrentUser();
  const scope = u ? scopeLeadWhere(u) : {};
  const vista = p.vista === "chiusi" || p.vista === "tutti" ? p.vista : "dafare";
  const q = p.q?.trim();
  const oggi = chiaveGiorno(new Date());
  const inizioOggi = inizioGiorno(oggi);
  const fineOggi = inizioGiorno(aggiungiGiorni(oggi, 1));
  // i «non gestiti» (finiti i tentativi senza risposta) non sono più task di oggi: stanno in «Recupero contatti»
  const aperti: Prisma.LeadWhereInput = { fase: { in: FASI_APERTE }, nonGestitoIl: null };
  // visite già passate: non sono un compito del centralino (le esita il venditore dal calendario)
  const VISITE = ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "APPUNTAMENTO_FISSATO"];
  // «chiamata con commerciale»: il task è del commerciale che chiama, non della telefonista
  const soloLeChiamateMie: Prisma.LeadWhereInput = u ? { NOT: { fase: "APPUNTAMENTO_TELEFONICO", OR: [{ venditoreId: null }, { venditoreId: { not: u.id } }] } } : {};
  const elenco = !!q || !!p.fase || vista !== "dafare";

  const filtroElenco: Prisma.LeadWhereInput = q
    ? { AND: q.split(/\s+/).filter(Boolean).slice(0, 6).map((p) => ({ OR: [{ nome: { contains: p, mode: "insensitive" as const } }, { telefono: { contains: p } }, { email: { contains: p, mode: "insensitive" as const } }] })) }
    : p.fase ? { fase: p.fase } : vista === "chiusi" ? { fase: { notIn: FASI_APERTE } } : {};

  const [daFare, inProgramma, lavoratiOggi, risultati, totali, stato, fatto] = await Promise.all([
    elenco ? Promise.resolve([] as Riga[]) : prisma.lead.findMany({
      // un appuntamento già passato non è un compito della telefonista (lo esita il venditore dal calendario)
      where: { AND: [scope, aperti, { OR: [{ scadenzaAzione: null }, { scadenzaAzione: { lt: fineOggi } }] }, { NOT: { fase: { in: VISITE }, scadenzaAzione: { lt: inizioOggi } } }, soloLeChiamateMie] },
      orderBy: [{ scadenzaAzione: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], take: 200, select: SELEZIONE,
    }),
    elenco ? Promise.resolve([] as Riga[]) : prisma.lead.findMany({
      where: { AND: [scope, aperti, { scadenzaAzione: { gte: fineOggi } }, soloLeChiamateMie] },
      orderBy: { scadenzaAzione: "asc" }, take: 100, select: SELEZIONE,
    }),
    elenco ? Promise.resolve([]) : prisma.lead.findMany({
      where: { AND: [scope, { eventi: { some: { tipo: "lead.esito", createdAt: { gte: inizioOggi } } } }] },
      select: { ...SELEZIONE, eventi: { where: { tipo: "lead.esito", createdAt: { gte: inizioOggi } }, orderBy: { createdAt: "desc" }, take: 1, select: { testo: true, createdAt: true, utenteNome: true } } },
      take: 200,
    }),
    elenco ? prisma.lead.findMany({ where: { AND: [scope, filtroElenco] }, orderBy: { createdAt: "desc" }, take: 100, select: SELEZIONE }) : Promise.resolve([] as Riga[]),
    prisma.lead.groupBy({ by: ["fase"], where: { AND: [scope] }, _count: { _all: true } }),
    statoAutomazioni(),
    p.fatto ? prisma.lead.findFirst({ where: { AND: [scope, { id: p.fatto }] }, select: { id: true, nome: true } }) : Promise.resolve(null),
  ]);
  const conta = (fasi: string[]) => totali.filter((t) => fasi.includes(t.fase)).reduce((s, t) => s + t._count._all, 0);
  const tutti = totali.reduce((s, t) => s + t._count._all, 0);
  const adesso = Date.now();
  lavoratiOggi.sort((a, b) => b.eventi[0].createdAt.getTime() - a.eventi[0].createdAt.getTime());

  const tab = (v: string, testo: string) => (
    <Link href={`/lead?vista=${v}`} className={`rounded-full border px-3 py-1.5 text-sm ${vista === v && !q && !p.fase ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>{testo}</Link>
  );

  const riga = (l: Riga, extra?: React.ReactNode) => {
    const fase = FASI_LEAD[l.fase] ?? { nome: l.fase, azione: null, colore: "bg-neutral-100 text-neutral-700" };
    const s = l.scadenzaAzione;
    const scaduto = !!s && s.getTime() < adesso && !fase.chiusa;
    const diOggi = !!s && s >= inizioOggi && s < fineOggi;
    const badge = fase.chiusa ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${fase.colore}`}>{fase.nome}</span>
      : scaduto ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{diOggi ? "Scaduto" : "In ritardo"}</span>
      : !s ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">Nuovo</span>
      : diOggi ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">Oggi</span>
      : <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-700">{giorno(s)}</span>;
    return (
      <li key={l.id} className={`flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0 hover:bg-blue-50 ${scaduto ? "bg-red-50/40" : ""}`}>
        <Link href={`/lead/${l.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <span className="truncate text-sm font-bold text-neutral-900">{fase.chiusa ? l.nome : fase.azione ?? fase.nome}</span>
          </div>
          <p className="truncate text-xs text-neutral-600">
            {fase.chiusa ? "" : <b className="text-neutral-800">{l.nome}</b>}{fase.chiusa ? "" : " · "}{l.brand.nome}{l.prodotto ? ` · ${l.prodotto}` : ""}{l.comune ? ` · ${l.comune}` : ""}
            {u && l.telefonista && puo(u, "pubblicita") ? ` · ${l.telefonista.nome}` : ""}
            {l.nonGestitoIl ? " · ⚠️ non gestito" : ""}
          </p>
          {extra}
        </Link>
        <div className="shrink-0 text-right">
          {s && !fase.chiusa && <p className={`text-xs ${scaduto ? "font-bold text-red-700" : "text-neutral-600"}`}>{diOggi ? ora(s) : `${giorno(s)} ${ora(s)}`}</p>}
          {l.telefono && <a href={`tel:${l.telefono}`} className="text-xs font-semibold text-blue-800 underline">📞 {l.telefono}</a>}
        </div>
      </li>
    );
  };
  const lista = (righe: Riga[]) => <ul className="overflow-hidden rounded-lg border border-neutral-200 bg-white">{righe.map((l) => riga(l))}</ul>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📞 Task di oggi</h1>
          <p className="text-sm text-neutral-600">Chi chiamare adesso. Tocca una riga per aprire il lead e registrare l&apos;esito.</p>
        </div>
        <form className="flex gap-2"><input name="q" defaultValue={q ?? ""} placeholder="Cerca nome, telefono, email" className={inp} /><button className="btn-3d btn-3d-teal px-3 py-1.5 text-sm">Cerca</button></form>
      </div>
      <div className="flex flex-wrap gap-2">
        {tab("dafare", `Da fare (${conta(FASI_APERTE)})`)}{tab("chiusi", `Chiusi (${tutti - conta(FASI_APERTE)})`)}{tab("tutti", `Tutti (${tutti})`)}
        <Link href="/lead/recupero" className="rounded-full border border-teal-600 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900 hover:bg-teal-100">♻️ Recupero contatti</Link>
      </div>

      {(!stato.attive || !stato.posta) && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⏸ Email automatiche {!stato.posta ? "non attive: manca la configurazione della posta (SMTP)" : "in pausa"}. Gli esiti si registrano e gli invii vengono programmati, ma le email non partono.
          {puo(u, "automazioni") && <> <Link href="/impostazioni/automazioni" className="underline">Impostazioni › Email automatiche</Link></>}
        </p>
      )}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      {fatto && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          ✅ Esito registrato per <b>{fatto.nome}</b>. <Link href={`/lead/${fatto.id}`} className="underline">Riapri il lead</Link> se c&apos;è da correggere.
        </p>
      )}

      {elenco ? (
        <>
          {(q || p.fase) && <Link href="/lead" className="btn-indietro">← Task di oggi</Link>}
          <p className="text-sm text-neutral-600">{q ? <>Risultati per «{q}»</> : p.fase ? <>Fase: <b>{FASI_LEAD[p.fase]?.nome ?? p.fase}</b></> : vista === "chiusi" ? "Lead chiusi" : "Tutti i lead"} · {risultati.length}{risultati.length === 100 ? "+ (i più recenti)" : ""}</p>
          {risultati.length ? lista(risultati) : <p className="text-sm text-neutral-600">Nessun lead qui.</p>}
        </>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-700">Da fare entro oggi · {daFare.length}</h2>
            {daFare.length ? lista(daFare) : <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-900">Nessun task per oggi: ottimo lavoro! 🎉</p>}
          </section>

          {inProgramma.length > 0 && (
            <details className="rounded-lg border border-neutral-200 bg-white">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold text-neutral-800">📅 In programma nei prossimi giorni · {inProgramma.length}</summary>
              <ul className="border-t border-neutral-100">{inProgramma.map((l) => riga(l))}</ul>
            </details>
          )}

          <details className="rounded-lg border border-neutral-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold text-neutral-800">✓ Lavorati oggi · {lavoratiOggi.length}</summary>
            <p className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-600">Hai sbagliato un esito? Apri il lead e registra quello giusto: il percorso riparte da capo.</p>
            <ul className="border-t border-neutral-100">
              {lavoratiOggi.map((l) => riga(l, <p className="truncate text-xs text-green-800">✓ {l.eventi[0].testo} · {ora(l.eventi[0].createdAt)}{l.eventi[0].utenteNome ? ` · ${l.eventi[0].utenteNome}` : ""}</p>))}
              {lavoratiOggi.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">Ancora nessuno.</li>}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
