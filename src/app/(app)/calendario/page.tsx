export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { mailConfigurata } from "@/lib/mail/invio";
import { eventiPeriodo } from "@/lib/calendario/server";
import { STILE_TIPO, impagina, giorniEvento, annullato, vedeTutti, type EventoCal, type TipoEvento } from "@/lib/calendario/eventi";
import {
  chiaveGiorno, perInput, inizioGiorno, aggiungiGiorni, lunediDi, grigliaMese, nomeMese, giornoBreve, nomeGiorno, oraRoma,
} from "@/lib/calendario/tempo";
import FormAppuntamento from "@/components/calendario/FormAppuntamento";

type Vista = "giorno" | "settimana" | "mese" | "agenda";
const ORA_DA = 7;
const ORA_A = 21;
const PX_ORA = 52;
const TUTTI_TIPI: TipoEvento[] = ["APPUNTAMENTO", "RILIEVO", "POSA", "ASSISTENZA"];

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  if (!u) return null;
  const tutti = vedeTutti(u.ruolo);
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
  const [eventi, utenti] = await Promise.all([
    eventiPeriodo({ da: inizioGiorno(daK), a: inizioGiorno(aK), utenteId: filtroUtente, tipi }),
    prisma.utente.findMany({ where: { passwordHash: { not: null } }, select: { id: true, nome: true, ufficio: true }, orderBy: { nome: "asc" } }),
  ]);
  const clientePreset = sp.cliente ? await prisma.cliente.findUnique({ where: { id: sp.cliente }, select: { id: true, nome: true, email: true } }) : null;

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = { vista, giorno, persona: tutti ? persona : undefined, tipi: sp.tipi, ...o };
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
  const linkNuovo = (data: string) => `${qs({ nuovo: data })}#nuovo`;

  return (
    <div className="max-w-[1400px]">
      {/* testata */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-2xl font-black text-neutral-900">📅 Calendario</h1>
        <div className="flex items-center gap-1">
          <Link href={qs({ giorno: prima })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">‹</Link>
          <Link href={qs({ giorno: oggi })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">Oggi</Link>
          <Link href={qs({ giorno: dopo })} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">›</Link>
        </div>
        <p className="text-lg font-bold text-neutral-800 capitalize">{titolo}</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={linkNuovo(nuovoData)} className="btn-3d btn-3d-green px-4 py-2 text-sm">+ Nuovo appuntamento</a>
          <Link href="/calendario/sul-telefono" className="btn-3d btn-3d-dark px-4 py-2 text-sm">📱 Sul telefono</Link>
        </div>
      </div>

      {sp.msg && <p className="mb-3 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">{sp.msg}</p>}

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
            <Link key={t} href={qs({ tipi: nuovi.length === 4 ? undefined : nuovi.join(",") || "nessuno" })}
              className="text-xs font-bold px-2.5 py-1 rounded-full border-2"
              style={{ borderColor: STILE_TIPO[t].colore, background: on ? STILE_TIPO[t].colore : "white", color: on ? "white" : STILE_TIPO[t].colore }}>
              {STILE_TIPO[t].icona} {STILE_TIPO[t].nome}
            </Link>
          );
        })}
        {tutti && (
          <form action="/calendario" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="vista" value={vista} />
            <input type="hidden" name="giorno" value={giorno} />
            {sp.tipi && <input type="hidden" name="tipi" value={sp.tipi} />}
            <select name="persona" defaultValue={persona} className="border border-neutral-300 rounded px-2 py-1.5 text-sm">
              <option value="tutti">👥 Tutto il team</option>
              <option value={u.id}>👤 Solo io</option>
              {utenti.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.ufficio ? ` · ${x.ufficio.toLowerCase()}` : ""}</option>)}
            </select>
            <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Mostra</button>
          </form>
        )}
      </div>

      {vista === "settimana" && <Griglia giorni={Array.from({ length: 7 }, (_, i) => aggiungiGiorni(daK, i))} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo} />}
      {vista === "giorno" && (
        <GrigliaPersone giorno={giorno} eventi={eventi} oggi={oggi} linkNuovo={linkNuovo}
          persone={filtroUtente ? utenti.filter((x) => x.id === filtroUtente) : utenti.filter((x) => eventi.some((e) => e.utenteId === x.id))} />
      )}
      {vista === "mese" && <Mese giorno={giorno} eventi={eventi} oggi={oggi} qs={qs} />}
      {vista === "agenda" && <Agenda eventi={eventi} />}

      {/* nuovo appuntamento */}
      <section id="nuovo" className="card-fase mt-6 scroll-mt-4" style={{ "--fase": "#16a34a" } as React.CSSProperties}>
        <h2 className="mb-3">+ Nuovo appuntamento</h2>
        <FormAppuntamento
          utenti={utenti} utenteId={filtroUtente ?? u.id} puoAssegnare={tutti} data={nuovoData}
          cliente={clientePreset} ritorno={qs({})} mailAttiva={mailConfigurata()}
        />
      </section>
    </div>
  );
}

function Scheda({ e, compatta }: { e: EventoCal; compatta?: boolean }) {
  const s = STILE_TIPO[e.tipo];
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
            <div key={g} className={`min-h-[110px] border-t border-l border-neutral-100 p-1 ${g.slice(0, 7) !== mese ? "bg-neutral-50/70 text-neutral-400" : ""}`}>
              <Link href={qs({ vista: "giorno", giorno: g })} className={`inline-block text-xs font-black px-1.5 rounded ${g === oggi ? "bg-blue-600 text-white" : ""}`}>{+g.slice(8)}</Link>
              <div className="space-y-0.5 mt-0.5">
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

function Agenda({ eventi }: { eventi: EventoCal[] }) {
  const perGiorno = new Map<string, EventoCal[]>();
  for (const e of eventi) for (const g of giorniEvento(e)) perGiorno.set(g, [...(perGiorno.get(g) ?? []), e]);
  const giorni = [...perGiorno.keys()].sort();
  if (!giorni.length) return <p className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-600">Nessun impegno nei prossimi 30 giorni.</p>;
  return (
    <div className="space-y-3">
      {giorni.map((g) => (
        <div key={g} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <p className="bg-neutral-50 px-4 py-1.5 text-sm font-bold capitalize">{giornoBreve(g)}</p>
          {perGiorno.get(g)!.map((e) => {
            const s = STILE_TIPO[e.tipo];
            return (
              <Link key={e.id} href={e.href} className={`flex items-start gap-3 border-t border-neutral-100 px-4 py-2 hover:bg-neutral-50 ${annullato(e) ? "opacity-50 line-through" : ""}`}>
                <span className="w-14 shrink-0 text-sm font-bold" style={{ color: s.colore }}>{e.giornataIntera ? "giorno" : oraRoma(e.inizio)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900">{s.icona} {e.titolo}</span>
                  <span className="block text-xs text-neutral-600">{[e.chi, e.luogo].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
