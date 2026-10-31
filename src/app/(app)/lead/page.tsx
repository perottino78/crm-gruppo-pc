export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeLeadWhere } from "@/lib/scope";
import { perInput } from "@/lib/calendario/tempo";
import { FASI_LEAD, FASI_APERTE, ESITI, PERCORSI, esitiPossibili } from "@/lib/automazioni/percorsi";
import { statoAutomazioni } from "@/lib/automazioni/motore";
import { esitoLead, assegnaVenditoreLead } from "@/app/lead-percorso-actions";
import { CONTATTI } from "@/lib/automazioni/email";

type P = { vista?: string; id?: string; q?: string; fatto?: string; errore?: string };
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATO_EMAIL: Record<string, string> = { INVIATA: "✅ inviata", FALLITA: "❌ non inviata", SOPPRESSA: "🚫 non inviata", PREPARATA: "⏳ in preparazione" };

/** Lead da lavorare: la coda delle telefoniste, con l'esito di ogni chiamata che fa partire le email automatiche. */
export default async function LeadPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  const p = await searchParams;
  const vista = p.vista === "chiusi" || p.vista === "tutti" ? p.vista : "dafare";
  const scope = u ? scopeLeadWhere(u) : {};
  const ricerca: Prisma.LeadWhereInput = p.q?.trim()
    ? { OR: [{ nome: { contains: p.q.trim(), mode: "insensitive" } }, { telefono: { contains: p.q.trim() } }, { email: { contains: p.q.trim(), mode: "insensitive" } }] }
    : {};
  const filtroVista: Prisma.LeadWhereInput = vista === "dafare" ? { fase: { in: FASI_APERTE } } : vista === "chiusi" ? { fase: { notIn: FASI_APERTE } } : {};
  const where: Prisma.LeadWhereInput = { AND: [scope, ricerca, p.id ? { id: p.id } : filtroVista] };
  const [lead, totali, stato, venditori] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: vista === "dafare" ? [{ scadenzaAzione: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] : [{ createdAt: "desc" }],
      take: 60,
      include: {
        brand: true, telefonista: { select: { nome: true } }, clienteGenerato: { select: { id: true } },
        eventi: { orderBy: { createdAt: "desc" }, take: 8 },
        emailLead: { orderBy: { createdAt: "desc" }, take: 8 },
        invii: { where: { stato: { in: ["IN_ATTESA", "DA_VERIFICARE", "FALLITO"] } }, orderBy: { eseguiDopo: "asc" } },
      },
    }),
    prisma.lead.groupBy({ by: ["fase"], where: { AND: [scope] }, _count: { _all: true } }),
    statoAutomazioni(),
    prisma.utente.findMany({ where: { ruolo: { in: ["COMMERCIALE", "AMMINISTRATORE"] } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const nomeVenditore = (id?: string | null) => venditori.find((v) => v.id === id)?.nome;
  const opzioniVenditori = venditori.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>);
  const conta = (fasi: string[]) => totali.filter((t) => fasi.includes(t.fase)).reduce((s, t) => s + t._count._all, 0);
  const adesso = Date.now();
  const ritorno = `/lead?${new URLSearchParams(Object.entries({ vista: p.vista, q: p.q }).filter(([, v]) => v) as [string, string][])}`;
  const tab = (v: string, testo: string) => (
    <Link href={`/lead?vista=${v}`} className={`px-3 py-1.5 rounded-full text-sm border ${vista === v && !p.id ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}>{testo}</Link>
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📞 Lead da lavorare</h1>
          <p className="text-sm text-neutral-600">Chi chiamare adesso, in ordine di scadenza. Registra l&apos;esito di ogni chiamata: il CRM manda da solo le email al cliente e i solleciti al centralino.</p>
        </div>
        <form className="flex gap-2"><input name="q" defaultValue={p.q ?? ""} placeholder="Cerca nome, telefono, email" className={inp} /><button className="btn-3d btn-3d-teal text-sm px-3 py-1.5">Cerca</button></form>
      </div>
      <div className="flex flex-wrap gap-2">
        {tab("dafare", `Da fare (${conta(FASI_APERTE)})`)}{tab("chiusi", `Chiusi (${totali.reduce((s, t) => s + t._count._all, 0) - conta(FASI_APERTE)})`)}{tab("tutti", "Tutti")}
      </div>

      {(!stato.attive || !stato.posta) && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⏸ Email automatiche {!stato.posta ? "non attive: manca la configurazione della posta (SMTP)" : "in pausa"}. Gli esiti si registrano e gli invii vengono programmati, ma le email non partono.
          {u?.ruolo === "AMMINISTRATORE" && <> <Link href="/impostazioni/automazioni" className="underline">Impostazioni › Email automatiche</Link></>}
        </p>
      )}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      {p.fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Esito registrato. <Link href={`/lead?id=${p.fatto}`} className="underline">Vedi il lead</Link></p>}
      {p.id && <Link href="/lead" className="text-sm text-blue-800 underline">← tutti i lead da fare</Link>}

      <div className="space-y-3">
        {lead.map((l) => {
          const fase = FASI_LEAD[l.fase] ?? { nome: l.fase, azione: null, colore: "bg-neutral-100 text-neutral-700" };
          const scaduto = l.scadenzaAzione && l.scadenzaAzione.getTime() < adesso && !fase.chiusa;
          const esiti = esitiPossibili(l.fase);
          const classificazione = l.fase === "NUOVO";
          return (
            <div key={l.id} id={l.id} className={`card-fase bg-white rounded-lg border p-4 ${scaduto ? "border-red-300" : "border-neutral-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">{l.nome} <span className="text-xs font-normal text-neutral-500">· {l.brand.nome} · {l.fonte}{l.prodotto ? ` · ${l.prodotto}` : ""}</span></p>
                  <p className="text-sm">
                    {l.telefono && <a href={`tel:${l.telefono}`} className="text-blue-800 underline mr-3">📞 {l.telefono}</a>}
                    {l.email && <span className="text-neutral-700 mr-3">✉️ {l.email}</span>}
                    {(l.comune || l.cap) && <span className="text-neutral-600">📍 {[l.cap, l.comune].filter(Boolean).join(" ")}</span>}
                  </p>
                  <p className="text-xs text-neutral-500">Arrivato {quando(l.createdAt)} · assegnato a {l.telefonista?.nome ?? "—"}{l.clienteGenerato && <> · <Link href={`/clienti/${l.clienteGenerato.id}`} className="underline">scheda cliente</Link></>}</p>
                </div>
                <div className="text-right space-y-1">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${fase.colore}`}>{fase.nome}</span>
                  {fase.azione && <p className={`text-xs ${scaduto ? "text-red-700 font-semibold" : "text-neutral-600"}`}>{fase.azione}{l.scadenzaAzione ? ` · entro ${quando(l.scadenzaAzione)}` : ""}{scaduto ? " · SCADUTO" : ""}</p>}
                  {l.nonGestitoIl && <p className="text-xs text-red-700">⚠️ non gestito dal {quando(l.nonGestitoIl)}</p>}
                  {l.disiscritto && <p className="text-xs text-neutral-500">🚫 non vuole email</p>}
                </div>
              </div>
              {l.note && <p className="mt-2 text-xs text-neutral-700 whitespace-pre-line bg-neutral-50 rounded p-2">{l.note}</p>}

              {(l.fase === "APPUNTAMENTO_CASA" || l.fase === "APPUNTAMENTO_SHOWROOM") && l.appuntamentoIl && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
                  <span>📅 <b>{quando(l.appuntamentoIl)}</b> · {l.fase === "APPUNTAMENTO_CASA" ? `a casa: ${l.indirizzoAppuntamento ?? "—"}` : `showroom: ${CONTATTI.showroom}`}</span>
                  <span>{l.venditoreId ? <>· venditore <b>{nomeVenditore(l.venditoreId) ?? "—"}</b> <Link href={`/calendario?giorno=${perInput(l.appuntamentoIl).slice(0, 10)}`} className="underline text-xs">calendario</Link></> : <b className="text-red-700">· ⚠️ venditore da assegnare</b>}</span>
                  <form action={assegnaVenditoreLead} className="flex items-center gap-1 ml-auto">
                    <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
                    <select name="venditoreId" required defaultValue={l.venditoreId ?? ""} className={inp}><option value="" disabled>venditore…</option>{opzioniVenditori}</select>
                    <button className="btn-3d btn-3d-purple text-xs px-3 py-1.5">{l.venditoreId ? "Cambia venditore" : "Assegna venditore"}</button>
                  </form>
                </div>
              )}

              {classificazione ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {["IN_TARGET", "FUORI_REGIONE"].map((e) => (
                    <form key={e} action={esitoLead}>
                      <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="esito" value={e} /><input type="hidden" name="ritorno" value={ritorno} />
                      <button className={`btn-3d ${e === "IN_TARGET" ? "btn-3d-green" : "btn-3d-outline"} text-sm px-4 py-2`}>{e === "IN_TARGET" ? "✅ In target" : "Fuori regione"}</button>
                    </form>
                  ))}
                </div>
              ) : (
                <form action={esitoLead} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
                  <label className="text-xs text-neutral-600">Esito della chiamata
                    <select name="esito" required defaultValue="" className={`${inp} w-full`}>
                      <option value="" disabled>scegli…</option>
                      {esiti.map((e) => <option key={e} value={e}>{ESITI[e].nome}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-neutral-600">Data e ora (ricontatto / appuntamento)
                    <input type="datetime-local" name="data" defaultValue={l.fase.startsWith("APPUNTAMENTO") && l.appuntamentoIl ? perInput(l.appuntamentoIl) : ""} className={`${inp} w-full`} />
                  </label>
                  <label className="text-xs text-neutral-600">Venditore (per l&apos;appuntamento)
                    <select name="venditoreId" defaultValue={l.venditoreId ?? ""} className={`${inp} w-full`}><option value="">da assegnare dopo</option>{opzioniVenditori}</select>
                  </label>
                  <label className="text-xs text-neutral-600">Indirizzo (appuntamento a casa)
                    <input name="indirizzo" defaultValue={l.indirizzoAppuntamento ?? [l.cap, l.comune].filter(Boolean).join(" ")} placeholder="via, numero, comune" className={`${inp} w-full`} />
                  </label>
                  <label className="text-xs text-neutral-600">Note utili al venditore
                    <input name="note" placeholder="facoltative" className={`${inp} w-full`} />
                  </label>
                  <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Registra esito</button>
                </form>
              )}

              <details className="mt-3" open={!!p.id}>
                <summary className="text-xs text-neutral-600 cursor-pointer select-none">Storico, email e prossimi invii ({l.emailLead.length} email)</summary>
                <div className="grid sm:grid-cols-2 gap-3 mt-2 text-xs">
                  <div>
                    <p className="font-semibold mb-1">Storico</p>
                    {l.eventi.map((e) => <p key={e.id} className="text-neutral-700">{quando(e.createdAt)} · {e.testo}{e.utenteNome ? ` (${e.utenteNome})` : ""}</p>)}
                    {!l.eventi.length && <p className="text-neutral-500">—</p>}
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Email</p>
                    {l.emailLead.map((e) => <p key={e.id} className="text-neutral-700">{quando(e.createdAt)} · {e.categoria === "CLIENTE" ? "al cliente" : "interna"} · {e.oggetto} · {STATO_EMAIL[e.stato] ?? e.stato}{e.motivo ? ` (${e.motivo})` : ""}</p>)}
                    {!l.emailLead.length && <p className="text-neutral-500">—</p>}
                    {l.invii.length > 0 && <p className="font-semibold mt-2 mb-1">Prossimi invii</p>}
                    {l.invii.map((i) => <p key={i.id} className={i.stato === "IN_ATTESA" ? "text-neutral-700" : "text-red-700"}>{quando(i.eseguiDopo)} · {PERCORSI[i.percorso]?.[i.passo]?.nome ?? i.percorso}{i.stato !== "IN_ATTESA" ? ` · ${i.stato === "DA_VERIFICARE" ? "da verificare" : "non riuscito"}${i.errore ? `: ${i.errore}` : ""}` : ""}</p>)}
                  </div>
                </div>
              </details>
            </div>
          );
        })}
        {lead.length === 0 && <p className="text-sm text-neutral-600">Nessun lead {vista === "dafare" ? "da lavorare: ottimo lavoro! 🎉" : "qui."}</p>}
      </div>
    </div>
  );
}
