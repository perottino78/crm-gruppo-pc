export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { scopeLeadWhere } from "@/lib/scope";
import { FASI_LEAD, FASI_APERTE, PERCORSI, MAX_RECUPERI } from "@/lib/automazioni/percorsi";

type P = { tipo?: string; q?: string; fatto?: string };
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit" });

// I tre gruppi di «Recupero contatti» (richiesta di Rocco): chi ha detto no, chi non ha mai risposto ai tentativi, chi è già tornato col recupero automatico
const GRUPPI: Record<string, { nome: string; spiega: string; where: Prisma.LeadWhereInput }> = {
  "non-interessati": { nome: "Non interessati", spiega: "hanno detto di no (o non erano ancora pronti)", where: { fase: "NON_INTERESSATO" } },
  "non-gestiti": { nome: "Non hanno risposto", spiega: "finiti i tentativi di chiamata senza esito", where: { nonGestitoIl: { not: null }, fase: { in: FASI_APERTE.filter((f) => f !== "RECUPERO") } } },
  "da-recuperare": { nome: "Già in recupero", spiega: "la promozione è partita: sono tornati nei task del centralino", where: { fase: "RECUPERO" } },
};

/**
 * Recupero contatti: i lead persi (non interessati, non hanno mai risposto, già in recupero). Tornano da soli nei task dopo N mesi
 * (recupero automatico), ma qui si possono richiamare in qualsiasi momento ed esitare come alla prima chiamata: l'esito annulla il
 * recupero automatico programmato (a meno che non ci rientrino).
 */
export default async function RecuperoContatti({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const u = await getCurrentUser();
  const scope = u ? scopeLeadWhere(u) : {};
  const tipo = p.tipo && GRUPPI[p.tipo] ? p.tipo : "tutti";
  const q = p.q?.trim();
  const tuttiGruppi: Prisma.LeadWhereInput = { OR: Object.values(GRUPPI).map((g) => g.where) };
  const cerca: Prisma.LeadWhereInput = q
    ? { AND: q.split(/\s+/).filter(Boolean).slice(0, 6).map((x) => ({ OR: [{ nome: { contains: x, mode: "insensitive" as const } }, { telefono: { contains: x } }, { email: { contains: x, mode: "insensitive" as const } }] })) }
    : {};
  const [leads, conti] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [scope, tipo === "tutti" ? tuttiGruppi : GRUPPI[tipo].where, cerca] },
      select: {
        id: true, nome: true, telefono: true, fase: true, prodotto: true, comune: true, recuperi: true, nonGestitoIl: true, createdAt: true,
        brand: { select: { nome: true } }, telefonista: { select: { nome: true } },
        eventi: { where: { tipo: "lead.esito" }, orderBy: { createdAt: "desc" }, take: 1, select: { testo: true, createdAt: true, utenteNome: true } },
        invii: { where: { stato: "IN_ATTESA" }, select: { percorso: true, passo: true, eseguiDopo: true } },
      },
      orderBy: { createdAt: "desc" }, take: 300,
    }),
    Promise.all(Object.entries(GRUPPI).map(async ([k, g]) => [k, await prisma.lead.count({ where: { AND: [scope, g.where] } })] as const)),
  ]);
  const quanti = Object.fromEntries(conti);
  const totale = conti.reduce((s, [, n]) => s + n, 0);
  // quando torna da solo nei task: il passo «recupero» già programmato
  const ritorno = (l: (typeof leads)[number]) => l.invii.find((i) => PERCORSI[i.percorso]?.[i.passo]?.tipo === "RECUPERO")?.eseguiDopo ?? null;
  // percorso in corso che finisce con il recupero automatico (la data esatta si fissa all'ultimo passo)
  const inArrivo = (l: (typeof leads)[number]) => l.invii.some((i) => PERCORSI[i.percorso]?.at(-1)?.tipo === "RECUPERO");

  const tab = (k: string, testo: string) => (
    <Link href={`/lead/recupero${k === "tutti" ? "" : `?tipo=${k}`}`} className={`rounded-full border px-3 py-1.5 text-sm ${tipo === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>{testo}</Link>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">♻️ Recupero contatti</h1>
          <p className="text-sm text-neutral-600">Lead persi da richiamare quando vuoi: apri la riga, guarda lo storico e registra l&apos;esito come alla prima chiamata. Tornano anche da soli nei task dopo qualche mese (recupero automatico): l&apos;esito registrato qui lo annulla.</p>
        </div>
        <Link href="/lead" className="btn-indietro">← Task di oggi</Link>
      </div>
      <form className="flex gap-2">
        {tipo !== "tutti" && <input type="hidden" name="tipo" value={tipo} />}
        <input name="q" defaultValue={q ?? ""} placeholder="Cerca nome, telefono, email" className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
        <button className="btn-3d btn-3d-teal px-3 py-1.5 text-sm">Cerca</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {tab("tutti", `Tutti (${totale})`)}
        {Object.entries(GRUPPI).map(([k, g]) => <span key={k}>{tab(k, `${g.nome} (${quanti[k] ?? 0})`)}</span>)}
      </div>
      {tipo !== "tutti" && <p className="text-xs text-neutral-500">{GRUPPI[tipo].nome}: {GRUPPI[tipo].spiega}.</p>}
      {p.fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Esito registrato: il recupero automatico di quel contatto è stato annullato.</p>}

      {leads.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">Nessun contatto da recuperare{q ? ` per «${q}»` : ""}.</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {leads.map((l) => {
            const fase = FASI_LEAD[l.fase] ?? { nome: l.fase, colore: "bg-neutral-100 text-neutral-700" };
            const torna = ritorno(l);
            const esito = l.eventi[0];
            return (
              <li key={l.id} className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0 hover:bg-blue-50">
                <Link href={`/lead/${l.id}?da=recupero`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${fase.colore}`}>{l.nonGestitoIl && l.fase !== "NON_INTERESSATO" ? "Non ha risposto" : fase.nome}</span>
                    <span className="truncate text-sm font-bold text-neutral-900">{l.nome}</span>
                  </div>
                  <p className="truncate text-xs text-neutral-600">
                    {l.brand.nome}{l.prodotto ? ` · ${l.prodotto}` : ""}{l.comune ? ` · ${l.comune}` : ""}
                    {u && l.telefonista && puo(u, "pubblicita") ? ` · ${l.telefonista.nome}` : ""}
                    {l.recuperi > 0 ? ` · ♻️ recuperato ${l.recuperi}/${MAX_RECUPERI}` : ""}
                  </p>
                  {esito && <p className="truncate text-xs text-neutral-500">Ultimo esito {giorno(esito.createdAt)}: {esito.testo}</p>}
                </Link>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-neutral-500">{torna ? <>torna nei task il <b>{giorno(torna)}</b></> : l.recuperi >= MAX_RECUPERI ? "recuperi automatici finiti" : inArrivo(l) ? "recupero automatico in programma" : "nessun ritorno programmato"}</p>
                  {l.telefono && <a href={`tel:${l.telefono}`} className="text-xs font-semibold text-blue-800 underline">📞 {l.telefono}</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
