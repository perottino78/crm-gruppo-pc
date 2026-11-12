export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { mailConfigurata } from "@/lib/mail/invio";
import { eventiPeriodo } from "@/lib/calendario/server";
import { STILE_TIPO, impagina, giorniEvento, annullato, vedeTutti, coloriPersone, stileEvento, cercaEventi, type EventoCal, type TipoEvento } from "@/lib/calendario/eventi";
import {
  chiaveGiorno, perInput, inizioGiorno, aggiungiGiorni, lunediDi, grigliaMese, nomeMese, giornoBreve, nomeGiorno, oraRoma,
} from "@/lib/calendario/tempo";
import FormAppuntamento from "@/components/calendario/FormAppuntamento";
import FormRiunione from "@/components/calendario/FormRiunione";

type Vista = "giorno" | "settimana" | "mese" | "agenda";
const ORA_DA = 7;
const ORA_A = 21;
const PX_ORA = 52;
const TUTTI_TIPI: TipoEvento[] = ["APPUNTAMENTO", "RILIEVO", "POSA", "ASSISTENZA", "RIUNIONE", "ESTERNO"];

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  if (!u) return null;
  const tutti = vedeTutti(u);
  const oggi = chiaveGiorno(new Date());
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno ?? "") ? sp.giorno! : oggi;
  const vista: Vista = (["giorno", "settimana", "mese", "agenda"] as Vista[]).includes(sp.vista as Vista) ? (sp.vista as Vista) : "settimana";
  const persona = tutti ? (sp.persona ?? "tutti") : u.id;
  const filtroUtente = persona === "tutti" ? null : persona === "me" ? u.id : persona;
  const tipi = (sp.tipi ? sp.tipi.split(",") : TUTTI_TIPI).filter((t): t is TipoEvento => TUTTI_TIPI.includes(t as TipoEvento));

  const [daK, aK] =
    vista === "giorno" ? [giorno, aggiungiGiorni(giorno, 1)]
    : vista === "settimana" ? [lunediDi(giorno), aggiungiGiorni(lunediDi(giorno), 7)]
    : vista === "mese" ? [grigliaMese(giorno)[0], aggiungiGiorni(grigliaMese(giorno)[41], 1)]
    : [giorno, aggiungiGiorni(giorno, 30)];
  const [tuttiEventi, utenti] = await Promise.all([
    eventiPeriodo({ da: inizioGiorno(daK), a: inizioGiorno(aK), utenteId: filtroUtente, tipi }),
    prisma.utente.findMany({ where: { OR: [{ stato: "ATTIVO" }, { passwordHash: { not: null } }] }, select: { id: true, nome: true, ufficio: true, stato: true, coloreCalendario: true, inCalendario: true }, orderBy: { nome: "asc" } }),
  ]);
  // gli annullati non occupano spazio: si vedono solo a richiesta (?annullati=1)
  const conAnnullati = sp.annullati === "1";
  const nAnnullati = tuttiEventi.filter(annullato).length;
  // ogni persona ha il suo colore (sempre lo stesso: in ordine di nome fra chi lavora), con la legenda sopra il calendario
  // colore scelto in Impostazioni › Utenti (o automatico); chi ha «calendario attivo» spento non compare nel calendario del team
  const colori = coloriPersone(utenti.filter((x) => x.stato === "ATTIVO" && x.inCalendario).map((x) => ({ id: x.id, colore: x.coloreCalendario })));
  const nascosti = new Set(utenti.filter((x) => !x.inCalendario).map((x) => x.id));
  const visibile = (e: EventoCal) => persona !== "tutti" || !e.utenteId || !nascosti.has(e.utenteId);
  const conColori = (e: EventoCal) => ({ ...e, ...(e.utenteId ? colori.get(e.utenteId) : undefined) });
  const eventi = (conAnnullati ? tuttiEventi : tuttiEventi.filter((e) => !annullato(e))).filter(visibile).map(conColori);
  // ricerca veloce (la lente): nome, paese/città, via, telefono — negli ultimi 2 anni e nel prossimo
  const cerca = (sp.cerca ?? "").trim();
  const trovati = cerca
    ? cercaEventi((await eventiPeriodo({ da: inizioGiorno(aggiungiGiorni(oggi, -730)), a: inizioGiorno(aggiungiGiorni(oggi, 366)), utenteId: filtroUtente })).filter(visibile), cerca).map(conColori)
    : [];
  const adesso = new Date();
  const trovatiFuturi = trovati.filter((e) => e.fine >= adesso);
  const trovatiPassati = trovati.filter((e) => e.fine < adesso);
  const legenda = utenti.filter((x) => eventi.some((e) => e.utenteId === x.id)).map((x) => ({ id: x.id, nome: x.nome, colore: colori.get(x.id)?.colore ?? "#737373" }));
  const clientePreset = sp.cliente ? await prisma.cliente.findUnique({ where: { id: sp.cliente }, select: { id: true, nome: true, email: true } }) : null;

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = { vista, giorno, persona: tutti ? persona : undefined, tipi: sp.tipi, annullati: conAnnullati ? "1" : undefined, cliente: sp.cliente, ...("nuovo" in o ? {} : { nuovo: undefined }), ...o };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/calendario?${p.toString()}`;
  };
  const passo = vista === "giorno" ? 1 : vista === "settimana" ? 7 : vista === "agenda" ? 30 : 0;
  const prima = vista === "mese" ? aggiungiGiorni(`${giorno.slice(0, 7)}-01`, -1) : aggiungiGiorni(giorno, -passo);
  const dopo = vista === "mese" ? aggiungiGiorni(grigliaMese(giorno)[41], 1).slice(0, 8) + "01" : aggiungiGiorni(giorno, passo);
  const titolo =
    vista === "giorno" ? `${nomeGiorno(giorno)} ${+giorno.slice(8)} ${nomeMese(giorno)}`
    : vista === "mese" ? nomeMese(giorno)
    : vista === "settimana" ? `${giornoBreve(daK)} – ${giornoBreve(aggiungiGiorni(daK, 6))}`
    : `Prossimi 30 giorni da ${giornoBreve(giorno)}`;
  const nuovoData = sp.nuovo && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sp.nuovo) ? sp.nuovo : perInput(new Date(Math.ceil(Date.now() / 3600_000) * 3600_000));
  const linkNuovo = (data: string) => `${qs({ nuovo: data, genere: sp.cliente ? "cliente" : undefined })}#nuovo`;
  // nella finestra del nuovo appuntamento: con un cliente o riunione del team (con il cliente già scelto si salta la domanda)
  const genere = sp.nuovo ? (sp.genere === "riunione" ? "riunione" : sp.genere === "cliente" || clientePreset ? "cliente" : null) : null;
  // impegni per persona e giorno nelle prossime settimane (sotto la scelta del giorno, come un sito di prenotazioni)
  const conteggi: Record<string, Record<string, number>> = {};
  if (genere === "cliente") {
    const da = lunediDi(nuovoData.slice(0, 10) < oggi ? oggi : nuovoData.slice(0, 10));
    for (const e of await eventiPeriodo({ da: inizioGiorno(da), a: inizioGiorno(aggiungiGiorni(da, 21)), utenteId: tutti ? null : u.id })) {
      if (annullato(e) || !e.utenteId) continue;
      for (const g of giorniEvento(e)) ((conteggi[e.utenteId] ??= {})[g] = (conteggi[e.utenteId][g] ?? 0) + 1);
    }
  }

  return (
    <div className="max-w-[1400px]">
      {/* testata */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3">
        <h1 className="hidden md:block text-2xl font-black text-neutral-900">📅 Calendario</h1>
        <div className="flex items-center gap-1">
          <Link href={qs({ giorno: prima })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">‹</Link>
          <Link href={qs({ giorno: oggi })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">Oggi</Link>
          <Link href={qs({ giorno: dopo })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">›</Link>
        </div>
        <p className="text-base md:text-lg font-bold text-neutral-800 capitalize">{titolo}</p>
        <form action="/calendario" role="search" className="w-full md:w-auto md:ml-auto flex items-center gap-1">
          <input type="hidden" name="vista" value={vista} />
          <input type="hidden" name="giorno" value={giorno} />
          {tutti && persona !== "tutti" && <input type="hidden" name="persona" value={persona} />}
          <input name="cerca" type="search" defaultValue={cerca} placeholder="🔍 Cerca nome, paese, via, telefono…" aria-label="Cerca nel calendario"
            className="flex-1 md:w-72 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <button className="btn-3d btn-3d-blue px-3 py-2 text-sm" aria-label="Cerca">🔍</button>
        </form>
        <div className="w-full md:w-auto flex flex-wrap gap-2">
          <a href={linkNuovo(nuovoData)} className="btn-3d btn-3d-green px-4 py-2 text-sm flex-1 md:flex-none text-center">+ Nuovo appuntamento</a>
          <Link href="/calendario/sul-telefono" className="btn-3d btn-3d-dark px-4 py-2 text-sm flex-1 md:flex-none text-center">📱 Su Google / telefono</Link>
        </div>
      </div>

      {sp.msg && <p className="mb-3 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">{sp.msg}</p>}
      {clientePreset && !sp.nuovo && (
        <p className="mb-3 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm text-purple-900">
          📅 Appuntamento per <b>{clientePreset.nome}</b>: premi sull&apos;orario libero nell&apos;agenda oppure <a href={linkNuovo(nuovoData)} className="font-bold underline">apri il modulo</a>.
          <Link href={qs({ cliente: undefined })} className="ml-2 text-xs underline">annulla</Link>
        </p>
      )}

      {/* barra viste e filtri */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["giorno", "settimana", "mese", "agenda"] as Vista[]).map((v) => (
          <Link key={v} href={qs({ vista: v })} className={`btn-3d px-3 py-1.5 text-xs capitalize ${vista === v ? "btn-3d-blue" : "btn-3d-outline"}`}>{v}</Link>
        ))}
        <span className="w-px h-6 bg-neutral-300 mx-1" />
        {TUTTI_TIPI.map((t) => {
          const on = tipi.includes(t);
          const nuovi = on ? tipi.filter((x) => x !== t) : [...tipi, t];
          return (
            <Link key={t} href={qs({ tipi: nuovi.length === TUTTI_TIPI.length ? undefined : nuovi.join(",") || "nessuno" })}
              aria-pressed={on}
              className={`text-xs font-bold px-2.5 py-1 rounded-full border-2 ${on ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 bg-white text-neutral-500"}`}>
              {STILE_TIPO[t].icona} {STILE_TIPO[t].nome}
            </Link>
          );
        })}
        {(nAnnullati > 0 || conAnnullati) && (
          <Link href={qs({ annullati: conAnnullati ? "" : "1" })} className="text-xs font-semibold text-neutral-600 underline">
            {conAnnullati ? "Nascondi gli annullati" : `Mostra annullati (${nAnnullati})`}
          </Link>
        )}
        {tutti && (
          <form action="/calendario" className="w-full md:w-auto md:ml-auto flex items-center gap-2">
            <input type="hidden" name="vista" value={vista} />
            <input type="hidden" name="giorno" value={giorno} />
            {sp.tipi && <input type="hidden" name="tipi" value={sp.tipi} />}
            {conAnnullati && <input type="hidden" name="annullati" value="1" />}
            <select name="persona" defaultValue={persona} className="flex-1 md:flex-none border border-neutral-300 rounded px-2 py-1.5 text-sm">
              <option value="tutti">👥 Tutto il team</option>
              <option value={u.id}>👤 Solo io</option>
              {utenti.filter((x) => x.id !== u.id && x.inCalendario).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.ufficio ? ` · ${x.ufficio.toLowerCase()}` : ""}</option>)}
            </select>
            <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Mostra</button>
          </form>
        )}
      </div>

      {legenda.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-700" aria-label="Legenda dei colori">
          <span className="font-semibold text-neutral-500">Colori:</span>
          {legenda.map((x) => (
            <Link key={x.id} href={tutti ? qs({ persona: x.id }) : qs({})} className="inline-flex items-center gap-1 hover:underline">
              <span className="h-3 w-3 rounded-sm" style={{ background: x.colore }} />{x.nome}
            </Link>
          ))}
        </div>
      )}

      {cerca && (
        <section className="mb-6 rounded-2xl border-2 border-blue-300 bg-blue-50/40 p-3 md:p-4" aria-label="Risultati della ricerca">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-neutral-900">🔍 {trovati.length ? `${trovati.length} ${trovati.length === 1 ? "impegno trovato" : "impegni trovati"}` : "Nessun impegno trovato"} per «{cerca}»</h2>
            <Link href={qs({ cerca: undefined })} className="text-sm font-bold text-blue-800 underline">✕ chiudi la ricerca</Link>
          </div>
          {trovatiFuturi.length > 0 && <><p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-600">In programma</p><Agenda eventi={trovatiFuturi} conAnno /></>}
          {trovatiPassati.length > 0 && <><p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-neutral-600">Già passati (dal più recente)</p><Agenda eventi={trovatiPassati} conAnno decrescente /></>}
          {!trovati.length && <p className="text-sm text-neutral-600">Prova con un&apos;altra parola: il cognome, il paese, la via o il numero di telefono (bastano 5 cifre).</p>}
        </section>
      )}

      {/* sul computer: griglia con le ore; sul telefono: elenco giorno per giorno, facile da scorrere col pollice */}
      {!cerca && vista === "settimana" && <>
        <div className="hidden md:block"><Griglia giorni={Array.from({ length: 7 }, (_, i) => aggiungiGiorni(daK, i))} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo} /></div>
        <div className="md:hidden"><ListaGiorni giorni={Array.from({ length: 7 }, (_, i) => aggiungiGiorni(daK, i))} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo} /></div>
      </>}
      {!cerca && vista === "giorno" && <>
        <div className="hidden md:block">
          <GrigliaPersone giorno={giorno} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo}
            persone={filtroUtente ? utenti.filter((x) => x.id === filtroUtente) : utenti.filter((x) => eventi.some((e) => e.utenteId === x.id))} />
        </div>
        <div className="md:hidden"><ListaGiorni giorni={[giorno]} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo} /></div>
      </>}
      {!cerca && vista === "mese" && <Mese giorno={giorno} eventi={eventi} oggi={oggi} qs={qs} />}
      {!cerca && vista === "agenda" && <Agenda eventi={eventi} />}

      {/* nuovo impegno (richiesta di Rocco): finestra sopra il calendario; prima si sceglie se è con un cliente o una riunione del team */}
      {sp.nuovo && (
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Nuovo appuntamento">
        <div id="nuovo" className="mt-4 w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-neutral-900">
              {genere === "riunione" ? "👥 Nuova riunione interna" : genere === "cliente" ? `🤝 Nuovo appuntamento${clientePreset ? ` con ${clientePreset.nome}` : " con un cliente"}` : "+ Nuovo appuntamento"}
            </h2>
            <Link href={qs({ genere: undefined })} scroll={false} className="rounded-full px-2 text-xl font-bold text-neutral-500 hover:bg-neutral-100" aria-label="Chiudi">✕</Link>
          </div>
          {!genere && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href={qs({ nuovo: nuovoData, genere: "cliente" })} scroll={false} className="btn-3d tile-3d btn-3d-green py-6"><span className="text-3xl">🤝</span><span className="text-base">Con un cliente</span><span className="text-xs font-normal">visita, sopralluogo, firma, telefonata…</span></Link>
              <Link href={qs({ nuovo: nuovoData, genere: "riunione" })} scroll={false} className="btn-3d tile-3d btn-3d-blue py-6"><span className="text-3xl">👥</span><span className="text-base">Riunione interna</span><span className="text-xs font-normal">con una o più persone del team</span></Link>
            </div>
          )}
          {genere === "cliente" && (
            <FormAppuntamento
              utenti={utenti.filter((x) => x.stato === "ATTIVO")} utenteId={filtroUtente ?? u.id} puoAssegnare={tutti} data={nuovoData}
              cliente={clientePreset} ritorno={qs({ cliente: undefined, nuovo: undefined, genere: undefined })} mailAttiva={await mailConfigurata()}
              conteggi={conteggi} oggi={oggi}
            />
          )}
          {genere === "riunione" && (
            <FormRiunione utenti={utenti.filter((x) => x.stato === "ATTIVO")} data={nuovoData} io={u.id} ritorno={qs({ nuovo: undefined, genere: undefined })} />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function Scheda({ e, compatta }: { e: EventoCal; compatta?: boolean }) {
  const s = stileEvento(e);
  const off = annullato(e);
  return (
    <Link href={e.href} title={[e.titolo, e.chi, e.luogo].filter(Boolean).join(" · ")}
      className={`block h-full overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-[11px] leading-tight shadow-sm hover:brightness-95 ${off ? "opacity-50 line-through" : ""}`}
      style={{ background: s.chiaro, borderColor: s.colore, color: "#111" }}>
      <span className="font-bold">{e.giornataIntera ? s.icona : oraRoma(e.inizio)}</span> {e.cliente ?? e.titolo}
      {!compatta && <span className="block text-neutral-700 truncate">{s.icona} {e.chi ?? "—"}{e.luogo ? ` · ${e.luogo}` : ""}</span>}
    </Link>
  );
}

function ColonnaOre({ eventi, giorno, linkNuovo }: { eventi: EventoCal[]; giorno: string; linkNuovo: (d: string) => string }) {
  const pos = impagina(eventi.filter((e) => !e.giornataIntera && giorniEvento(e)[0] === giorno), ORA_DA, ORA_A);
  return (
    <div className="relative" style={{ height: (ORA_A - ORA_DA) * PX_ORA }}>
      {Array.from({ length: ORA_A - ORA_DA }, (_, i) => (
        <a key={i} href={linkNuovo(`${giorno}T${String(ORA_DA + i).padStart(2, "0")}:00`)} title="Nuovo appuntamento a quest'ora"
          className="absolute inset-x-0 border-t border-neutral-100 hover:bg-green-50" style={{ top: i * PX_ORA, height: PX_ORA }} />
      ))}
      {pos.map((p) => (
        <div key={p.e.id} className="absolute p-px" style={{ top: (p.top / 60) * PX_ORA, height: Math.max(22, (p.altezza / 60) * PX_ORA), left: `${(p.colonna / p.colonne) * 100}%`, width: `${100 / p.colonne}%` }}>
          <Scheda e={p.e} compatta={p.altezza < 45} />
        </div>
      ))}
    </div>
  );
}

function Righello() {
  return (
    <div className="relative" style={{ height: (ORA_A - ORA_DA) * PX_ORA }}>
      {Array.from({ length: ORA_A - ORA_DA }, (_, i) => (
        <span key={i} className="absolute right-1 -translate-y-1/2 text-[10px] text-neutral-500" style={{ top: i * PX_ORA }}>{i ? `${ORA_DA + i}:00` : ""}</span>
      ))}
    </div>
  );
}

function Griglia({ giorni, eventi, oggi, linkNuovo }: { giorni: string[]; eventi: EventoCal[]; oggi: string; linkNuovo: (d: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `48px repeat(${giorni.length}, 1fr)` }}>
        <div />
        {giorni.map((g) => (
          <a key={g} href={`/calendario?vista=giorno&giorno=${g}`} className={`border-l border-neutral-100 px-2 py-2 text-center ${g === oggi ? "bg-blue-600 text-white" : "bg-neutral-50"}`}>
            <span className="block text-[11px] uppercase font-bold">{nomeGiorno(g)}</span>
            <span className="block text-lg font-black leading-none">{+g.slice(8)}</span>
          </a>
        ))}
        <div className="text-[10px] text-neutral-500 text-right pr-1 pt-1 border-t border-neutral-200">tutto il giorno</div>
        {giorni.map((g) => (
          <div key={g} className="border-l border-t border-neutral-200 p-1 space-y-1 min-h-[34px]">
            {eventi.filter((e) => e.giornataIntera && giorniEvento(e).includes(g)).map((e) => <div key={e.id} className="h-7"><Scheda e={e} compatta /></div>)}
          </div>
        ))}
        <div className="border-t border-neutral-200"><Righello /></div>
        {giorni.map((g) => (
          <div key={g} className={`border-l border-t border-neutral-200 ${g === oggi ? "bg-blue-50/40" : ""}`}>
            <ColonnaOre eventi={eventi} giorno={g} linkNuovo={linkNuovo} />
          </div>
        ))}
      </div>
    </div>
  );
}

function GrigliaPersone({ giorno, eventi, persone, oggi, linkNuovo }: { giorno: string; eventi: EventoCal[]; persone: { id: string; nome: string }[]; oggi: string; linkNuovo: (d: string) => string }) {
  const senza = eventi.filter((e) => !e.utenteId || !persone.some((p) => p.id === e.utenteId));
  const colonne = [...persone.map((p) => ({ id: p.id, nome: p.nome, ev: eventi.filter((e) => e.utenteId === p.id) })), ...(senza.length ? [{ id: "altri", nome: "Esterni / non assegnati", ev: senza }] : [])];
  if (!colonne.length) return <p className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-600">Nessun impegno {giorno === oggi ? "oggi" : "in questo giorno"}. <a href={linkNuovo(`${giorno}T09:00`)} className="font-bold text-green-700 underline">Fissa un appuntamento</a></p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns: `48px repeat(${colonne.length}, minmax(180px, 1fr))` }}>
        <div />
        {colonne.map((c) => <div key={c.id} className="border-l border-neutral-100 bg-neutral-50 px-2 py-2 text-center text-sm font-bold truncate">{c.nome}</div>)}
        <div className="text-[10px] text-neutral-500 text-right pr-1 pt-1 border-t border-neutral-200">giorno</div>
        {colonne.map((c) => (
          <div key={c.id} className="border-l border-t border-neutral-200 p-1 space-y-1 min-h-[34px]">
            {c.ev.filter((e) => e.giornataIntera).map((e) => <div key={e.id} className="h-7"><Scheda e={e} compatta /></div>)}
          </div>
        ))}
        <div className="border-t border-neutral-200"><Righello /></div>
        {colonne.map((c) => (
          <div key={c.id} className="border-l border-t border-neutral-200">
            <ColonnaOre eventi={c.ev} giorno={giorno} linkNuovo={linkNuovo} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Mese({ giorno, eventi, oggi, qs }: { giorno: string; eventi: EventoCal[]; oggi: string; qs: (o: Record<string, string | undefined>) => string }) {
  const giorni = grigliaMese(giorno);
  const mese = giorno.slice(0, 7);
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="grid grid-cols-7 bg-neutral-50 text-center text-[11px] font-bold uppercase text-neutral-600">
        {["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {giorni.map((g) => {
          const ev = eventi.filter((e) => giorniEvento(e).includes(g));
          return (
            <div key={g} className={`min-h-[56px] md:min-h-[110px] border-t border-l border-neutral-100 p-1 ${g.slice(0, 7) !== mese ? "bg-neutral-50/70 text-neutral-400" : ""}`}>
              <Link href={qs({ vista: "giorno", giorno: g })} className={`inline-block text-xs font-black px-1.5 rounded ${g === oggi ? "bg-blue-600 text-white" : ""}`}>{+g.slice(8)}</Link>
              {/* telefono: un pallino colorato per impegno, tocca il giorno per vederli */}
              {ev.length > 0 && (
                <Link href={qs({ vista: "giorno", giorno: g })} className="md:hidden mt-1 flex flex-wrap items-center gap-0.5">
                  {ev.slice(0, 6).map((e) => <span key={e.id} className="h-2 w-2 rounded-full" style={{ background: stileEvento(e).colore, opacity: annullato(e) ? 0.35 : 1 }} />)}
                  {ev.length > 6 && <span className="text-[9px] font-bold text-neutral-600">+{ev.length - 6}</span>}
                </Link>
              )}
              <div className="hidden md:block space-y-0.5 mt-0.5">
                {ev.slice(0, 4).map((e) => <div key={e.id} className="h-5"><Scheda e={e} compatta /></div>)}
                {ev.length > 4 && <Link href={qs({ vista: "giorno", giorno: g })} className="block text-[10px] font-bold text-blue-700">+ altri {ev.length - 4}</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Telefono: un riquadro per giorno con gli impegni in ordine di ora (anche i giorni liberi, con "+ fissa"). */
function ListaGiorni({ giorni, eventi, oggi, linkNuovo }: { giorni: string[]; eventi: EventoCal[]; oggi: string; linkNuovo: (d: string) => string }) {
  return (
    <div className="space-y-2">
      {giorni.map((g) => {
        const ev = eventi.filter((e) => giorniEvento(e).includes(g)).sort((a, b) => Number(b.giornataIntera) - Number(a.giornataIntera) || a.inizio.getTime() - b.inizio.getTime());
        return (
          <div key={g} className={`overflow-hidden rounded-xl border bg-white ${g === oggi ? "border-blue-500 ring-1 ring-blue-500" : "border-neutral-200"}`}>
            <div className={`flex items-center justify-between px-3 py-2 ${g === oggi ? "bg-blue-600 text-white" : "bg-neutral-50"}`}>
              <span className="text-sm font-black capitalize">{nomeGiorno(g)} {+g.slice(8)} {nomeMese(g).split(" ")[0]}{g === oggi ? " · oggi" : ""}</span>
              <a href={linkNuovo(`${g}T09:00`)} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${g === oggi ? "bg-white/20" : "bg-green-100 text-green-800"}`}>+ fissa</a>
            </div>
            {ev.map((e) => {
              const st = stileEvento(e);
              return (
                <Link key={e.id} href={e.href} className={`flex items-stretch gap-3 border-t border-neutral-100 px-3 py-2.5 active:bg-neutral-100 ${annullato(e) ? "opacity-50 line-through" : ""}`}>
                  <span className="w-1 shrink-0 rounded-full" style={{ background: st.colore }} />
                  <span className="w-12 shrink-0 text-sm font-black tabular-nums text-neutral-900">{e.giornataIntera ? "giorno" : oraRoma(e.inizio)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-neutral-900">{st.icona} {e.cliente ?? e.titolo}</span>
                    <span className="block text-xs text-neutral-600">{[e.chi, e.luogo].filter(Boolean).join(" · ") || st.nome}</span>
                  </span>
                </Link>
              );
            })}
            {!ev.length && <p className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-400">Libero</p>}
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ eventi, conAnno, decrescente }: { eventi: EventoCal[]; conAnno?: boolean; decrescente?: boolean }) {
  const perGiorno = new Map<string, EventoCal[]>();
  // nei risultati della ricerca una posa di più giorni compare solo al primo giorno
  for (const e of eventi) for (const g of conAnno ? giorniEvento(e).slice(0, 1) : giorniEvento(e)) perGiorno.set(g, [...(perGiorno.get(g) ?? []), e]);
  const giorni = [...perGiorno.keys()].sort();
  if (decrescente) giorni.reverse();
  if (!giorni.length) return <p className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-600">Nessun impegno nei prossimi 30 giorni.</p>;
  return (
    <div className="space-y-3">
      {giorni.map((g) => (
        <div key={g} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <p className="bg-neutral-50 px-4 py-1.5 text-sm font-bold capitalize">{giornoBreve(g)}{conAnno ? ` ${g.slice(0, 4)}` : ""}</p>
          {perGiorno.get(g)!.map((e) => {
            const s = stileEvento(e);
            return (
              <Link key={e.id} href={e.href} className={`flex items-start gap-3 border-t border-neutral-100 px-4 py-2 hover:bg-neutral-50 ${annullato(e) ? "opacity-50 line-through" : ""}`}>
                <span className="w-14 shrink-0 border-l-4 pl-2 text-sm font-bold text-neutral-900" style={{ borderColor: s.colore }}>{e.giornataIntera ? "giorno" : oraRoma(e.inizio)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900">{s.icona} {e.titolo}</span>
                  <span className="block text-xs text-neutral-600">{[e.chi, e.luogo, conAnno ? e.telefono : null].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
