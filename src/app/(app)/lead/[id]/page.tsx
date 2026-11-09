export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { scopeLeadWhere } from "@/lib/scope";
import { perInput } from "@/lib/calendario/tempo";
import { FASI_LEAD, ESITI, PERCORSI, esitiPossibili } from "@/lib/automazioni/percorsi";
import { CONTATTI } from "@/lib/automazioni/email";
import { leggiNoteLead, provenienzaLead } from "@/lib/automazioni/note-lead";
import { esitoLead, assegnaVenditoreLead, riassegnaLead, aggiungiNotaLead, spostaProssimaAttivita, modificaDatiLead } from "@/app/lead-percorso-actions";
import EsitoLead from "@/components/lead/EsitoLead";
import RisposteModulo from "@/components/lead/RisposteModulo";

type P = { ok?: string; errore?: string; fatto?: string };
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
  const [venditori, persone] = await Promise.all([
    prisma.utente.findMany({ where: { ruolo: { in: ["COMMERCIALE", "AMMINISTRATORE"] }, OR: [{ stato: "ATTIVO" }, { id: l.venditoreId ?? "-" }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    gestisce || l.telefonistaId === u.id
      ? prisma.utente.findMany({ where: { stato: "ATTIVO", ruolo: { not: "POSATORE" } }, select: { id: true, nome: true, ruolo: true }, orderBy: [{ ruolo: "desc" }, { nome: "asc" }] })
      : Promise.resolve([]),
  ]);

  const fase = FASI_LEAD[l.fase] ?? { nome: l.fase, azione: null, colore: "bg-neutral-100 text-neutral-700" };
  const note = leggiNoteLead(l.note);
  const provenienza = provenienzaLead(l.fonte, note);
  const scaduto = !!l.scadenzaAzione && l.scadenzaAzione.getTime() < Date.now() && !fase.chiusa;
  const ritorno = `/lead/${l.id}`;
  const appuntamento = (l.fase === "APPUNTAMENTO_CASA" || l.fase === "APPUNTAMENTO_SHOWROOM") && l.appuntamentoIl;
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/lead" className="btn-indietro">← Task di oggi</Link>

      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      {p.fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Esito registrato. <Link href="/lead" className="font-semibold underline">Torna ai task di oggi</Link></p>}

      <header className="card-fase rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Attività dedicata</p>
        <h1 className="text-xl font-bold text-neutral-900">{fase.azione ?? fase.nome}</h1>
        <p className="text-sm text-neutral-700">Lead: <b>{l.nome}</b> <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs ${fase.colore}`}>{fase.nome}</span>
          {l.clienteGenerato && <> · <Link href={`/clienti/${l.clienteGenerato.id}`} className="text-blue-800 underline">scheda cliente</Link></>}
        </p>
        {l.nonGestitoIl && <p className="mt-1 text-xs font-semibold text-red-700">⚠️ Non gestito dal {quando(l.nonGestitoIl)}</p>}
      </header>

      <section className="card-fase rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-neutral-900">Contatto</h2>
        <ul className="space-y-1 text-sm text-neutral-800">
          {l.telefono && <li>📞 <a href={`tel:${l.telefono}`} className="font-semibold text-blue-800 underline">{l.telefono}</a></li>}
          {l.email && <li>✉️ {l.email}{l.emailRimbalzata === l.email && <span className="ml-1 text-xs text-red-700">(email tornata indietro)</span>}{l.disiscritto && <span className="ml-1 text-xs text-neutral-500">(non vuole email)</span>}</li>}
          {(l.comune || l.cap) && <li>📍 {[l.comune, l.cap].filter(Boolean).join(" · ")}</li>}
          {l.prodotto && <li>🛠 {l.prodotto}</li>}
          <li>🏷 {l.brand.nome}</li>
          <li className="text-neutral-600">🕒 Arrivato {quando(l.createdAt)}{provenienza ? ` ${provenienza}` : ""}</li>
          {l.recuperi > 0 && <li className="text-teal-800">♻️ Recuperato {l.recuperi} {l.recuperi === 1 ? "volta" : "volte"}</li>}
        </ul>
        <details className="mt-3 rounded border border-neutral-200 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-700">✏️ Modifica i dati del lead</summary>
          <form action={modificaDatiLead} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">Nome e cognome<input name="nome" required defaultValue={l.nome} className={inp} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">Telefono<input name="telefono" type="tel" defaultValue={l.telefono ?? ""} className={inp} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">Email<input name="email" type="email" defaultValue={l.email ?? ""} className={inp} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">Prodotto di interesse<input name="prodotto" defaultValue={l.prodotto ?? ""} className={inp} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">Comune<input name="comune" defaultValue={l.comune ?? ""} className={inp} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">CAP<input name="cap" inputMode="numeric" defaultValue={l.cap ?? ""} className={inp} /></label>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button className="btn-3d btn-3d-blue px-4 py-1.5 text-sm">💾 Salva i dati</button>
              <span className="text-[11px] text-neutral-500">Resta un lead (non diventa cliente). La modifica resta nella cronologia.</span>
            </div>
          </form>
        </details>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 text-sm">
          <span className="text-neutral-600">Assegnato a <b className="text-neutral-900">{l.telefonista?.nome ?? "nessuno"}</b></span>
          {persone.length > 0 && (
            <form action={riassegnaLead} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <select name="telefonistaId" required defaultValue="" className={inp}>
                <option value="" disabled>passa a…</option>
                {persone.filter((x) => x.id !== l.telefonistaId).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.ruolo !== "TELEFONISTA" ? ` (${x.ruolo.toLowerCase()})` : ""}</option>)}
              </select>
              <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Passa</button>
            </form>
          )}
        </div>
      </section>

      {(note.risposte.length > 0 || note.altro.length > 0 || note.noteDatate.length > 0) && (
        <section className="card-fase rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-neutral-900">Risposte del modulo</h2>
          <RisposteModulo note={l.note} titoli={false} />
        </section>
      )}

      <section className="card-fase rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-neutral-900">Attività</h2>
        <ul className="mb-3 space-y-1 text-sm">
          <li><span className="text-neutral-500">Ultima:</span> {ultimoEsito ? <><b className="text-neutral-900">{ultimoEsito.testo}</b> <span className="text-neutral-500">· {quando(ultimoEsito.createdAt)}{ultimoEsito.utenteNome ? ` · ${ultimoEsito.utenteNome}` : ""}</span></> : <span className="text-neutral-500">nessun esito ancora</span>}</li>
          <li><span className="text-neutral-500">Prossima:</span> {fase.chiusa ? <span className="text-neutral-500">nessuna, lead chiuso</span> : <><b className={scaduto ? "text-red-700" : "text-neutral-900"}>{fase.azione}</b>{l.scadenzaAzione && <span className={scaduto ? "font-semibold text-red-700" : "text-neutral-500"}> · entro {quando(l.scadenzaAzione)}{scaduto ? " · SCADUTA" : ""}</span>}</>}</li>
        </ul>
        {!fase.chiusa && (
          <details className="mb-3 rounded border border-neutral-200 px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-700">✏️ Sposta la prossima attività</summary>
            <form action={spostaProssimaAttivita} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <input type="datetime-local" name="data" required defaultValue={l.scadenzaAzione ? perInput(l.scadenzaAzione) : ""} className={inp} />
              <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Salva</button>
            </form>
          </details>
        )}

        {appuntamento && (
          <div className="mb-3 space-y-2 rounded border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
            <p>📅 <b>{quando(l.appuntamentoIl!)}</b> · {l.fase === "APPUNTAMENTO_CASA" ? `a casa: ${l.indirizzoAppuntamento ?? "—"}` : `showroom: ${CONTATTI.showroom}`}</p>
            <p>{l.venditoreId ? <>Venditore <b>{nomeVenditore ?? "—"}</b> · <Link href={`/calendario?giorno=${perInput(l.appuntamentoIl!).slice(0, 10)}`} className="underline">vedi in calendario</Link></> : <b className="text-red-700">⚠️ Venditore da assegnare</b>}</p>
            <form action={assegnaVenditoreLead} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <select name="venditoreId" required defaultValue={l.venditoreId ?? ""} className={inp}><option value="" disabled>venditore…</option>{venditori.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select>
              <button className="btn-3d btn-3d-purple px-3 py-1.5 text-xs">{l.venditoreId ? "Cambia venditore" : "Assegna venditore"}</button>
            </form>
          </div>
        )}

        {l.fase === "NUOVO" ? (
          <div className="flex flex-wrap gap-2">
            {["IN_TARGET", "FUORI_REGIONE"].map((e) => (
              <form key={e} action={esitoLead}>
                <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="esito" value={e} /><input type="hidden" name="ritorno" value="/lead" />
                <button className={`btn-3d ${e === "IN_TARGET" ? "btn-3d-green" : "btn-3d-outline"} px-4 py-2 text-sm`}>{e === "IN_TARGET" ? "✅ In target" : "Fuori regione"}</button>
              </form>
            ))}
          </div>
        ) : (
          <EsitoLead
            leadId={l.id} ritorno="/lead" venditori={venditori} venditoreId={l.venditoreId}
            esiti={esitiPossibili(l.fase).map((k) => ({ chiave: k, nome: ESITI[k].nome, serveData: ESITI[k].serveData }))}
            indirizzo={l.indirizzoAppuntamento ?? [l.comune, l.cap].filter(Boolean).join(" ")}
            dataAppuntamento={l.fase.startsWith("APPUNTAMENTO") && l.appuntamentoIl ? perInput(l.appuntamentoIl) : ""}
          />
        )}
      </section>

      <section className="card-fase rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-neutral-900">Cronologia</h2>
        <form action={aggiungiNotaLead} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="leadId" value={l.id} /><input type="hidden" name="ritorno" value={ritorno} />
          <input name="testo" required maxLength={2000} placeholder="Aggiungi una nota (es. ha chiesto di richiamare il marito)" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-teal px-3 py-1.5 text-sm">Aggiungi una nota</button>
        </form>
        {l.invii.length > 0 && (
          <>
            <h3 className="mb-1 text-xs font-bold uppercase text-neutral-600">Prossimi invii automatici</h3>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
              {l.invii.map((i) => (
                <li key={i.id} className={i.stato === "IN_ATTESA" ? "text-neutral-800" : "text-red-700"}>
                  <span className="font-semibold text-neutral-900">{quando(i.eseguiDopo)}</span> · {PERCORSI[i.percorso]?.[i.passo]?.nome ?? i.percorso}
                  {i.stato !== "IN_ATTESA" && ` · ${i.stato === "DA_VERIFICARE" ? "da verificare" : "non riuscito"}${i.errore ? `: ${i.errore}` : ""}`}
                </li>
              ))}
            </ul>
          </>
        )}
        <ol className="relative space-y-3 border-l-2 border-neutral-200 pl-4">
          {cronologia.map((c) => (
            <li key={c.id} className="relative">
              <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${c.nota ? "bg-teal-600" : "bg-neutral-400"}`} />
              <p className="text-sm font-bold text-neutral-900">{c.titolo} <span className="text-xs font-normal text-neutral-500">· {quando(c.data)}{c.chi ? ` · ${c.chi}` : ""}</span></p>
              <p className="whitespace-pre-line text-sm text-neutral-700">{c.testo}</p>
            </li>
          ))}
          {cronologia.length === 0 && <li className="text-sm text-neutral-500">Ancora nessuna attività.</li>}
        </ol>
      </section>
    </div>
  );
}
