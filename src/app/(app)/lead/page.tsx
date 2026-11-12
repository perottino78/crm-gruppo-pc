export const dynamic = "force-dynamic";

import { appuntamentiSenzaEsito, regoleEsiti } from "@/lib/appuntamenti/esiti-server";
import { leadSimili, SOGLIA_FUZZY } from "@/lib/ricerca/server";
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
import { conteggiPerGiorno, dataTask, meseDi, meseVicino, perGiornoDecrescente, vistaDa, type Vista } from "@/lib/lead/elenco";
import CalendarioConteggi from "@/components/lead/CalendarioConteggi";

type P = { vista?: string; id?: string; q?: string; fatto?: string; errore?: string; ok?: string; fase?: string | string[]; giorno?: string; cerca?: string };
const inp = "border border-neutral-300 rounded-md px-2 py-1.5 text-sm";
const ora = (d: Date) => d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit" });
const giornoLungo = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const SELEZIONE = {
  id: true, nome: true, telefono: true, fase: true, scadenzaAzione: true, prodotto: true, comune: true, createdAt: true, nonGestitoIl: true,
  brand: { select: { nome: true } }, telefonista: { select: { nome: true } },
} satisfies Prisma.LeadSelect;
type Riga = Prisma.LeadGetPayload<{ select: typeof SELEZIONE }>;

// Stati del task (l'azione da fare) per i filtri di «Tutti»: un'etichetta per azione, anche se più fasi la condividono
const STATI_TASK = Object.entries(FASI_LEAD).reduce<{ etichetta: string; fasi: string[] }[]>((acc, [k, f]) => {
  const etichetta = f.azione ?? f.nome;
  const c = acc.find((x) => x.etichetta === etichetta);
  if (c) c.fasi.push(k); else acc.push({ etichetta, fasi: [k] });
  return acc;
}, []);

/** Lead da lavorare: Oggi (nuovi e di oggi) / Scaduti / In programma, più «Tutti» con ricerca per nome, giorno e stato. */
export default async function LeadPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  // vecchi link (/lead?id=…, anche nelle email): vanno alla pagina dedicata
  if (p.id) {
    const resto = new URLSearchParams(Object.entries({ errore: p.errore, ok: p.ok, fatto: p.fatto }).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/lead/${encodeURIComponent(p.id)}${resto ? `?${resto}` : ""}`);
  }
  const u = await getCurrentUser();
  const scope = u ? scopeLeadWhere(u) : {};
  const q = p.q?.trim();
  const fasiScelte = [p.fase ?? []].flat().filter(Boolean);
  const giornoScelto = p.giorno && /^\d{4}-\d{2}-\d{2}$/.test(p.giorno) ? p.giorno : null;
  // la ricerca (nome, giorno o stato) apre sempre «Tutti»
  const vista: Vista = q || fasiScelte.length || giornoScelto ? "tutti" : vistaDa(p.vista);
  const oggi = chiaveGiorno(new Date());
  const inizioOggi = inizioGiorno(oggi);
  const fineOggi = inizioGiorno(aggiungiGiorni(oggi, 1));
  // i «non gestiti» (finiti i tentativi senza risposta) non sono più task di oggi: stanno in «Recupero contatti»
  const aperti: Prisma.LeadWhereInput = { fase: { in: FASI_APERTE }, nonGestitoIl: null };
  // visite già passate: non sono un compito del centralino (le esita il venditore dal calendario)
  const VISITE = ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "APPUNTAMENTO_FISSATO"];
  const senzaVisitePassate: Prisma.LeadWhereInput = { NOT: { fase: { in: VISITE }, scadenzaAzione: { lt: inizioOggi } } };
  // «chiamata con commerciale»: il task è del commerciale che chiama, non della telefonista
  const soloLeChiamateMie: Prisma.LeadWhereInput = u ? { NOT: { fase: "APPUNTAMENTO_TELEFONICO", OR: [{ venditoreId: null }, { venditoreId: { not: u.id } }] } } : {};
  const base = [scope, aperti, senzaVisitePassate, soloLeChiamateMie];
  const dOggi: Prisma.LeadWhereInput = { OR: [{ scadenzaAzione: null }, { scadenzaAzione: { gte: inizioOggi, lt: fineOggi } }] };
  const dScaduti: Prisma.LeadWhereInput = { scadenzaAzione: { lt: inizioOggi } };
  const dProgramma: Prisma.LeadWhereInput = { scadenzaAzione: { gte: fineOggi } };
  const dChiusi: Prisma.LeadWhereInput = { fase: { notIn: FASI_APERTE } };

  // «Tutti»: filtri per nome/telefono/email, giorno del task, stati; finestra del calendario ±4 mesi per i conteggi
  const meseCal = giornoScelto ? meseDi(giornoScelto) : oggi.slice(0, 7);
  const finestraDal = inizioGiorno(`${meseVicino(meseCal, -4)}-01`), finestraAl = inizioGiorno(`${meseVicino(meseCal, 5)}-01`);
  const filtriTutti: Prisma.LeadWhereInput[] = [scope];
  const filtriSenzaNome = (): Prisma.LeadWhereInput[] => filtriTutti.filter((f) => f !== filtroNome);
  const filtroNome: Prisma.LeadWhereInput | null = q ? { AND: q.split(/\s+/).filter(Boolean).slice(0, 6).map((x) => ({ OR: [{ nome: { contains: x, mode: "insensitive" as const } }, { telefono: { contains: x } }, { email: { contains: x, mode: "insensitive" as const } }] })) } : null;
  if (filtroNome) filtriTutti.push(filtroNome);
  if (fasiScelte.length) filtriTutti.push({ fase: { in: STATI_TASK.filter((s) => fasiScelte.includes(s.etichetta) || s.fasi.some((f) => fasiScelte.includes(f))).flatMap((s) => s.fasi) } });
  if (giornoScelto) {
    const dal = inizioGiorno(giornoScelto), al = inizioGiorno(aggiungiGiorni(giornoScelto, 1));
    filtriTutti.push({ OR: [{ scadenzaAzione: { gte: dal, lt: al } }, { scadenzaAzione: null, createdAt: { gte: dal, lt: al } }] });
  }

  const regoleEs = await regoleEsiti();
  const nSenzaEsito = (await appuntamentiSenzaEsito({ giorni: regoleEs.giorniLista, regole: regoleEs })).length;
  const [nOggi, nScaduti, nProgramma, nChiusi, righeVista, lavoratiOggi, risultati, perCalendario, stato, fatto] = await Promise.all([
    prisma.lead.count({ where: { AND: [...base, dOggi] } }),
    prisma.lead.count({ where: { AND: [...base, dScaduti] } }),
    prisma.lead.count({ where: { AND: [...base, dProgramma] } }),
    prisma.lead.count({ where: { AND: [scope, dChiusi] } }),
    vista === "oggi" ? prisma.lead.findMany({ where: { AND: [...base, dOggi] }, orderBy: [{ scadenzaAzione: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], take: 300, select: SELEZIONE })
      : vista === "scaduti" ? prisma.lead.findMany({ where: { AND: [...base, dScaduti] }, orderBy: { scadenzaAzione: "asc" }, take: 300, select: SELEZIONE })
      : vista === "programma" ? prisma.lead.findMany({ where: { AND: [...base, dProgramma] }, orderBy: { scadenzaAzione: "asc" }, take: 300, select: SELEZIONE })
      : vista === "chiusi" ? prisma.lead.findMany({ where: { AND: [scope, dChiusi] }, orderBy: { createdAt: "desc" }, take: 200, select: SELEZIONE })
      : Promise.resolve([] as Riga[]),
    vista === "oggi" ? prisma.lead.findMany({
      where: { AND: [scope, { eventi: { some: { tipo: "lead.esito", createdAt: { gte: inizioOggi } } } }] },
      select: { ...SELEZIONE, eventi: { where: { tipo: "lead.esito", createdAt: { gte: inizioOggi } }, orderBy: { createdAt: "desc" }, take: 1, select: { testo: true, createdAt: true, utenteNome: true } } },
      take: 200,
    }) : Promise.resolve([]),
    vista === "tutti" && (q || fasiScelte.length || giornoScelto || p.cerca) ? prisma.lead.findMany({ where: { AND: filtriTutti }, orderBy: { createdAt: "desc" }, take: 500, select: SELEZIONE }) : Promise.resolve([] as Riga[]),
    vista === "tutti" ? prisma.lead.findMany({ where: { AND: [scope, { OR: [{ scadenzaAzione: { gte: finestraDal, lt: finestraAl } }, { scadenzaAzione: null, createdAt: { gte: finestraDal, lt: finestraAl } }] }] }, select: { scadenzaAzione: true, createdAt: true } }) : Promise.resolve([]),
    statoAutomazioni(),
    p.fatto ? prisma.lead.findFirst({ where: { AND: [scope, { id: p.fatto }] }, select: { id: true, nome: true } }) : Promise.resolve(null),
  ]);
  // ricerca che perdona gli errori: se il nome esatto trova poco, si aggiungono i nomi più somiglianti
  const simili = q && vista === "tutti" && risultati.length < SOGLIA_FUZZY ? await leadSimili(q, { AND: filtriSenzaNome() }, risultati.map((r) => r.id)) : [];
  if (simili.length) risultati.push(...await prisma.lead.findMany({ where: { id: { in: simili } }, select: SELEZIONE }));
  const adesso = Date.now();
  lavoratiOggi.sort((a, b) => b.eventi[0].createdAt.getTime() - a.eventi[0].createdAt.getTime());
  const conteggi = conteggiPerGiorno(perCalendario.map((l) => chiaveGiorno(dataTask(l))));
  const gruppi = perGiornoDecrescente([...risultati].sort((a, b) => dataTask(b).getTime() - dataTask(a).getTime()), (l) => chiaveGiorno(dataTask(l)));

  const tab = (v: Vista, testo: string, colore = "") => (
    <Link href={`/lead?vista=${v}`} className={`rounded-full border px-3 py-1.5 text-sm ${vista === v ? "border-neutral-900 bg-neutral-900 text-white" : `border-neutral-300 bg-white ${colore}`}`}>{testo}</Link>
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
        <form className="flex gap-2"><input type="hidden" name="vista" value="tutti" /><input name="q" defaultValue={q ?? ""} placeholder="Cerca nome, telefono, email" className={inp} /><button className="btn-3d btn-3d-teal px-3 py-1.5 text-sm">Cerca</button></form>
      </div>
      <div className="flex flex-wrap gap-2">
        {tab("oggi", `Oggi (${nOggi})`)}
        {tab("scaduti", `Scaduti (${nScaduti})`, nScaduti ? "text-red-700 border-red-300" : "")}
        {tab("programma", `In programma (${nProgramma})`)}
        {tab("chiusi", `Chiusi (${nChiusi})`)}
        {tab("tutti", "Tutti")}
        <Link href="/lead/recupero" className="rounded-full border border-teal-600 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900 hover:bg-teal-100">♻️ Recupero contatti</Link>
        <Link href="/lead/senza-esito" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${nSenzaEsito ? "border-red-400 bg-red-50 text-red-800 hover:bg-red-100" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>📋 Appuntamenti senza esito ({nSenzaEsito})</Link>
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

      {vista === "oggi" && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-700">Nuovi e da fare oggi · {righeVista.length}</h2>
            {righeVista.length ? lista(righeVista) : <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-900">Nessun task per oggi: ottimo lavoro! 🎉</p>}
            {nScaduti > 0 && <p className="mt-2 text-sm"><Link href="/lead?vista=scaduti" className="font-semibold text-red-700 underline">⚠️ Ci sono {nScaduti} task scaduti dei giorni scorsi</Link></p>}
          </section>
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

      {(vista === "scaduti" || vista === "programma" || vista === "chiusi") && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-700">
            {vista === "scaduti" ? "Scaduti nei giorni scorsi (dal più vecchio)" : vista === "programma" ? "In programma nei prossimi giorni" : "Lead chiusi (i più recenti)"} · {righeVista.length}
          </h2>
          {righeVista.length ? lista(righeVista) : <p className="text-sm text-neutral-600">{vista === "scaduti" ? "Nessun task scaduto. 👍" : "Nessun lead qui."}</p>}
        </section>
      )}

      {vista === "tutti" && (
        <>
          <form className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
            <input type="hidden" name="vista" value="tutti" />
            <input type="hidden" name="cerca" value="1" />
            <div className="flex flex-wrap items-center gap-2">
              <input name="q" defaultValue={q ?? ""} placeholder="Nome, telefono o email del lead" className={`${inp} flex-1 min-w-[180px]`} />
              <CalendarioConteggi conteggi={conteggi} iniziale={giornoScelto} meseIniziale={meseCal} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATI_TASK.map((s) => {
                const on = fasiScelte.includes(s.etichetta) || s.fasi.some((f) => fasiScelte.includes(f));
                return <label key={s.etichetta} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50" : "border-neutral-300"}`}><input type="checkbox" name="fase" value={s.etichetta} defaultChecked={on} />{s.etichetta}</label>;
              })}
            </div>
            <div className="flex gap-2">
              <button className="btn-3d btn-3d-blue px-4 py-1.5 text-sm">🔍 Cerca</button>
              <Link href="/lead?vista=tutti" className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">Azzera</Link>
            </div>
          </form>
          {!(q || fasiScelte.length || giornoScelto || p.cerca) ? (
            <p className="text-sm text-neutral-600">Scegli i filtri e premi «Cerca»: i task escono per giorno, dal più recente al più vecchio. Senza filtri «Cerca» mostra tutti i lead.</p>
          ) : (
            <>
              <p className="text-sm text-neutral-600">{risultati.length}{risultati.length === 500 ? "+ (i più recenti)" : ""} task trovati{simili.length ? <span className="ml-1 text-amber-800">· 🔎 {simili.length} con un nome simile a «{q}» (forse hai sbagliato una lettera)</span> : null}</p>
              {gruppi.map((g) => (
                <section key={g.giorno}>
                  <h3 className="sticky top-0 z-10 bg-neutral-50/95 py-1 text-xs font-bold uppercase tracking-wide text-neutral-600 capitalize">{giornoLungo(g.giorno)} · {g.righe.length}</h3>
                  {lista(g.righe)}
                </section>
              ))}
              {risultati.length === 0 && <p className="text-sm text-neutral-600">Nessun task con questi filtri.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
