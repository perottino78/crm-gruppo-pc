export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { scopeLeadWhere } from "@/lib/scope";
import { perInput } from "@/lib/calendario/tempo";
import { FASI_LEAD, ESITI, PERCORSI, esitiPossibili, ESITI_APPUNTAMENTO } from "@/lib/automazioni/percorsi";
import { CONTATTI } from "@/lib/automazioni/email";
import { leggiNoteLead, provenienzaLead } from "@/lib/automazioni/note-lead";
import { PROVENIENZE } from "@/lib/clienti/provenienza";
import { esitoLead, assegnaVenditoreLead, riassegnaLead, aggiungiNotaLead, spostaProssimaAttivita, modificaDatiLead } from "@/app/lead-percorso-actions";
import EsitoLead from "@/components/lead/EsitoLead";
import BottoneConferma from "@/components/BottoneConferma";
import { eliminaLead } from "@/app/elimina-contatti-actions";
import RisposteModulo from "@/components/lead/RisposteModulo";

type P = { ok?: string; errore?: string; fatto?: string; da?: string };
const inp = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATO_EMAIL: Record<string, string> = { INVIATA: "inviata", FALLITA: "non inviata", SOPPRESSA: "non inviata (bloccata)", PREPARATA: "in preparazione", RIMBALZATA: "tornata indietro" };
const TITOLI: Record<string, string> = {
  "lead.creato": "Lead arrivato", "lead.esito": "Esito registrato", "lead.venditore": "Venditore", "lead.assegnato": "Assegnazione",
  "lead.nota": "Nota", "lead.dati": "Dati modificati", "lead.spostato": "Prossima attività", "lead.non_gestito": "Non gestito", "lead.recupero": "Recupero",
  "email.inviata": "Email inviata", "email.fallita": "Email non inviata", "email.soppressa": "Email bloccata",
};

/** Attività dedicata di un lead: chi è, da dove arriva, cosa fare adesso (esito), cronologia e prossimi invii. */
export default async function LeadDettaglio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<P> }) {
  const [{ id }, p, u] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!u) notFound();
  const l = await prisma.lead.findFirst({
    where: { AND: [{ id }, scopeLeadWhere(u)] },
    include: {
      brand: true, telefonista: { select: { id: true, nome: true } }, clienteGenerato: { select: { id: true } },
      eventi: { orderBy: { createdAt: "desc" }, take: 60 },
      emailLead: { orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, categoria: true, oggetto: true, stato: true, motivo: true, apertaIl: true } },
      invii: { where: { stato: { in: ["IN_ATTESA", "DA_VERIFICARE", "FALLITO"] } }, orderBy: { eseguiDopo: "asc" } },
    },
  });
  if (!l) notFound();
  const gestisce = puo(u, "pubblicita") || puo(u, "marketing");
  const [venditori, persone, marchi] = await Promise.all([
    prisma.utente.findMany({ where: { OR: [{ ruolo: { in: ["COMMERCIALE", "AMMINISTRATORE"] }, stato: "ATTIVO" }, { vende: true, stato: "ATTIVO" }, { id: l.venditoreId ?? "-" }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    gestisce || l.telefonistaId === u.id
      ? prisma.utente.findMany({ where: { stato: "ATTIVO", ruolo: { not: "POSATORE" } }, select: { id: true, nome: true, ruolo: true }, orderBy: [{ ruolo: "desc" }, { nome: "asc" }] })
      : Promise.resolve([]),
    prisma.brand.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  const fase = FASI_LEAD[l.fase] ?? { nome: l.fase, azione: null, colore: "bg-neutral-100 text-neutral-700" };
  const note = leggiNoteLead(l.note);
  const provenienza = provenienzaLead(l.fonte, note);
  const scaduto = !!l.scadenzaAzione && l.scadenzaAzione.getTime() < Date.now() && !fase.chiusa;
  const ritorno = `/lead/${l.id}${p.da === "recupero" ? "?da=recupero" : ""}`;
  const appuntamento = ESITI_APPUNTAMENTO.includes(l.fase) && l.appuntamentoIl;
  const ultimoEsito = l.eventi.find((e) => e.tipo === "lead.esito");
  const nomeVenditore = venditori.find((v) => v.id === l.venditoreId)?.nome;

  // Cronologia unica: eventi + email (le email inviate hanno già il loro evento "email.*": si mostra solo la riga dell'email)
  const cronologia = [
    ...l.eventi.filter((e) => !e.tipo.startsWith("email.")).map((e) => ({ id: e.id, data: e.createdAt, titolo: TITOLI[e.tipo] ?? "Attività", testo: e.testo, chi: e.utenteNome, nota: e.tipo === "lead.nota" })),
    ...l.emailLead.map((e) => ({
      id: e.id, data: e.createdAt, titolo: e.categoria === "CLIENTE" ? "Email al cliente" : "Email interna",
      testo: `${e.oggetto} · ${STATO_EMAIL[e.stato] ?? e.stato}${e.motivo ? ` (${e.motivo})` : ""}${e.apertaIl ? " · 👁 aperta" : ""}`, chi: null, nota: false,
    })),
  ].sort((a, b) => b.data.getTime() - a.data.getTime());

  // da dove si arriva: i task di oggi o «Recupero contatti» (lì si torna dopo l'esito)
  const daRecupero = p.da === "recupero";
  const elenco = daRecupero ? "/lead/recupero" : "/lead";
  const nomeElenco = daRecupero ? "Recupero contatti" : "task di oggi";
  const piccolo = "text-xs font-semibold text-neutral-700";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* INTESTAZIONE: cosa fare (titolo), a chi è assegnato e lo stato, poi chi è il contatto */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900 sm:text-3xl">{fase.azione ?? fase.nome}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Lead assegnato a: <b className="text-neutral-900">{l.telefonista?.nome ?? "nessuno"}</b>
              <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${fase.colore}`}>{fase.nome}</span>
              {l.nonGestitoIl && <span className="ml-2 text-xs font-semibold text-red-700">⚠️ non gestito dal {quando(l.nonGestitoIl)}</span>}
              {l.clienteGenerato && <> · <Link href={`/clienti/${l.clienteGenerato.id}`} className="text-blue-800 underline">scheda cliente</Link></>}
            </p>
          </div>
          <Link href={elenco} className="btn-indietro shrink-0">← Torna ai {nomeElenco}</Link>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
          <ul className="grid list-disc gap-x-8 gap-y-1 pl-5 text-sm text-neutral-800 sm:grid-cols-2">
            <li><span className="text-neutral-500">Nome e cognome:</span> <b className="text-neutral-900">{l.nome}</b></li>
            <li><span className="text-neutral-500">Telefono:</span> {l.telefono ? <a href={`tel:${l.telefono}`} className="font-semibold text-blue-800 underline">{l.telefono}</a> : "—"}</li>
            <li><span className="text-neutral-500">Email:</span> {l.email ?? "—"}{l.email && l.emailRimbalzata === l.email && <span className="ml-1 text-xs text-red-700">(tornata indietro)</span>}{l.disiscritto && <span className="ml-1 text-xs text-neutral-500">(niente email promozionali)</span>}</li>
            <li><span className="text-neutral-500">Arrivato:</span> {quando(l.createdAt)}</li>
            <li><span className="text-neutral-500">Provenienza:</span> {provenienza ? provenienza.replace(/^da /, "") : l.fonte} · {l.brand.nome}</li>
            {l.prodotto && <li><span className="text-neutral-500">Prodotto di interesse:</span> {l.prodotto}</li>}
            {(l.comune || l.cap) && <li><span className="text-neutral-500">Comune / CAP:</span> {[l.comune, l.cap].filter(Boolean).join(" · ")}</li>}
            {note.risposte.map((r, i) => (
              <li key={`r${i}`}><span className="text-neutral-500">{r.domanda}:</span> {r.link ? <a href={r.risposta} target="_blank" rel="noreferrer" className="text-blue-800 underline">apri</a> : r.risposta}</li>
            ))}
            {note.altro.map((a, i) => <li key={`a${i}`}>{a}</li>)}
            {l.recuperi > 0 && <li className="text-teal-800">♻️ Recuperato {l.recuperi} {l.recuperi === 1 ? "volta" : "volte"}</li>}
          </ul>
          {note.noteDatate.length > 0 && (
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="mb-1 text-[11px] font-bold uppercase text-neutral-500">Note del centralino</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-800">
                {note.noteDatate.map((x, i) => <li key={i}><span className="font-semibold text-neutral-900">{x.data}{x.autore ? ` · ${x.autore}` : ""}:</span> {x.testo}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <details className="rounded border border-neutral-200 bg-white px-3 py-1.5">
              <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-700">✏️ Modifica i dati del lead</summary>
              <form action={modificaDatiLead} className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
                <label className={`flex flex-col gap-1 ${piccolo}`}>Nome e cognome<input name="nome" required defaultValue={l.nome} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Telefono<input name="telefono" type="tel" defaultValue={l.telefono ?? ""} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Email<input name="email" type="email" defaultValue={l.email ?? ""} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Prodotto di interesse<input name="prodotto" defaultValue={l.prodotto ?? ""} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Comune<input name="comune" defaultValue={l.comune ?? ""} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>CAP<input name="cap" inputMode="numeric" defaultValue={l.cap ?? ""} className={inp} /></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Marchio<select name="brandId" defaultValue={l.brandId} className={inp}>{marchi.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
                <label className={`flex flex-col gap-1 ${piccolo}`}>Provenienza<select name="fonte" defaultValue={PROVENIENZE.includes(l.fonte as (typeof PROVENIENZE)[number]) ? l.fonte : ""} className={inp}><option value="">{provenienza} (com&apos;è ora)</option>{PROVENIENZE.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <button className="btn-3d btn-3d-blue px-4 py-1.5 text-sm">💾 Salva i dati</button>
                  <span className="text-[11px] text-neutral-500">Resta un lead (non diventa cliente). La modifica resta nella cronologia.</span>
                </div>
              </form>
            </details>
            {persone.length > 0 && (
              <details className="rounded border border-neutral-200 bg-white px-3 py-1.5">
                <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-700">👤 Passa a un collega</summary>
                <form action={riassegnaLead} className="mt-2 flex flex-wrap items-center gap-1">
                  <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
                  <select name="telefonistaId" required defaultValue="" className={inp}>
                    <option value="" disabled>passa a…</option>
                    {persone.filter((x) => x.id !== l.telefonistaId).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.ruolo !== "TELEFONISTA" ? ` (${x.ruolo.toLowerCase()})` : ""}</option>)}
                  </select>
                  <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Passa</button>
                </form>
              </details>
            )}
            {puo(u, "clienti.elimina") && (
              <form action={eliminaLead} className="pt-1">
                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="ritorno" value="/lead" />
                <BottoneConferma messaggio={`Eliminare il lead «${l.nome}»? Spariscono anche la cronologia e le email in programma. Non si può annullare.`} className="text-xs text-red-700 underline">🗑 Elimina il lead</BottoneConferma>
              </form>
            )}
          </div>
        </div>
      </header>

      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      {p.fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Esito registrato. <Link href={elenco} className="font-semibold underline">Torna ai {nomeElenco}</Link></p>}

      {/* IL TASK: al centro e in evidenza */}
      <section className="rounded-xl border-2 border-blue-600 bg-white p-5 shadow-md sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold text-blue-900">📋 Task: {fase.chiusa ? "lead chiuso" : fase.azione}</h2>
          {!fase.chiusa && l.scadenzaAzione && <span className={`rounded-full px-3 py-1 text-sm font-bold ${scaduto ? "bg-red-600 text-white" : "bg-blue-50 text-blue-900"}`}>entro {quando(l.scadenzaAzione)}{scaduto ? " · SCADUTA" : ""}</span>}
        </div>
        <p className="mb-4 text-sm text-neutral-700">
          <span className="text-neutral-500">Ultima attività:</span> {ultimoEsito ? <><b className="text-neutral-900">{ultimoEsito.testo}</b> <span className="text-neutral-500">· {quando(ultimoEsito.createdAt)}{ultimoEsito.utenteNome ? ` · ${ultimoEsito.utenteNome}` : ""}</span></> : <span className="text-neutral-500">nessun esito ancora</span>}
        </p>

        {appuntamento && (
          <div className="mb-4 space-y-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm">
            <p>📅 <b>{quando(l.appuntamentoIl!)}</b> · {l.fase === "APPUNTAMENTO_CASA" ? `a casa: ${l.indirizzoAppuntamento ?? "—"}` : l.fase === "APPUNTAMENTO_TELEFONICO" ? "📞 la chiama il commerciale" : `showroom: ${CONTATTI.showroom}`}</p>
            <p>{l.venditoreId ? <>Venditore <b>{nomeVenditore ?? "—"}</b> · <Link href={`/calendario?giorno=${perInput(l.appuntamentoIl!).slice(0, 10)}`} className="underline">vedi in calendario</Link></> : <b className="text-red-700">⚠️ Venditore da assegnare</b>}</p>
            <form action={assegnaVenditoreLead} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <select name="venditoreId" required defaultValue={l.venditoreId ?? ""} className={inp}><option value="" disabled>venditore…</option>{venditori.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select>
              <button className="btn-3d btn-3d-purple px-3 py-1.5 text-xs">{l.venditoreId ? "Cambia venditore" : "Assegna venditore"}</button>
            </form>
          </div>
        )}

        <div className="rounded-lg bg-blue-50/40 p-3 sm:p-4">
          <p className="mb-2 text-sm font-bold text-neutral-900">Esito</p>
          {l.fase === "NUOVO" ? (
            <div className="flex flex-wrap gap-2">
              {["IN_TARGET", "FUORI_REGIONE"].map((e) => (
                <form key={e} action={esitoLead}>
                  <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="esito" value={e} /><input type="hidden" name="ritorno" value={elenco} />
                  <button className={`btn-3d ${e === "IN_TARGET" ? "btn-3d-green" : "btn-3d-outline"} px-5 py-2.5 text-sm`}>{e === "IN_TARGET" ? "✅ In target" : "Fuori regione"}</button>
                </form>
              ))}
            </div>
          ) : (
            <EsitoLead
              leadId={l.id} ritorno={elenco} venditori={venditori} venditoreId={l.venditoreId}
              esiti={esitiPossibili(l.fase).map((k) => ({ chiave: k, nome: ESITI[k].nome, serveData: ESITI[k].serveData }))}
              indirizzo={l.indirizzoAppuntamento ?? [l.comune, l.cap].filter(Boolean).join(" ")}
              dataAppuntamento={l.fase.startsWith("APPUNTAMENTO") && l.appuntamentoIl ? perInput(l.appuntamentoIl) : ""}
            />
          )}
        </div>

        {!fase.chiusa && (
          <details className="mt-3 rounded border border-neutral-200 px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-700">🕒 Non riesci adesso? Sposta il task a un altro momento</summary>
            <form action={spostaProssimaAttivita} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <input type="datetime-local" name="data" required defaultValue={l.scadenzaAzione ? perInput(l.scadenzaAzione) : ""} className={inp} />
              <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Salva</button>
            </form>
          </details>
        )}
      </section>

      {/* CRONOLOGIA in fondo */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-bold text-neutral-900">🕘 Cronologia</h2>
        <form action={aggiungiNotaLead} className="mb-5 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
          <input name="testo" required maxLength={2000} placeholder="Aggiungi una nota (es. ha chiesto di richiamare il marito)" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-teal px-3 py-1.5 text-sm">Aggiungi una nota</button>
        </form>
        {l.invii.length > 0 && (
          <div className="mb-5 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
            <h3 className="mb-1 text-[11px] font-bold uppercase text-neutral-600">Prossimi invii automatici</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {l.invii.map((i) => (
                <li key={i.id} className={i.stato === "IN_ATTESA" ? "text-neutral-800" : "text-red-700"}>
                  <span className="font-semibold text-neutral-900">{quando(i.eseguiDopo)}</span> · {PERCORSI[i.percorso]?.[i.passo]?.nome ?? i.percorso}
                  {i.stato !== "IN_ATTESA" && ` · ${i.stato === "DA_VERIFICARE" ? "da verificare" : "non riuscito"}${i.errore ? `: ${i.errore}` : ""}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="relative space-y-5 border-l-2 border-neutral-200 pl-5">
          {cronologia.map((c) => (
            <li key={c.id} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${c.nota ? "bg-teal-600" : "bg-neutral-400"}`} />
              <p className="text-xs text-neutral-500">{quando(c.data)}{c.chi ? ` · ${c.chi}` : ""}</p>
              <p className="text-sm font-bold text-neutral-900">{c.titolo}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{c.testo}</p>
            </li>
          ))}
          {cronologia.length === 0 && <li className="text-sm text-neutral-500">Ancora nessuna attività.</li>}
        </ol>
      </section>
    </div>
  );
}
