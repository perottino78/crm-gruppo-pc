export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { statoAutomazioni } from "@/lib/automazioni/motore";
import { PERCORSI, ESITI, type Quando } from "@/lib/automazioni/percorsi";
import { CONTATTI, MODELLI, componiEmail } from "@/lib/automazioni/email";
import { impostaAutomazioni, eseguiOra } from "@/app/lead-percorso-actions";

type P = { ok?: string; eseguiti?: string; inviate?: string; motivo?: string; errore?: string };
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ESEMPIO = {
  nome: "Mario Rossi", telefono: "333 1234567", email: "mario.rossi@email.it", comune: "Rivoli", cap: "10098", prodotto: "Pergola bioclimatica", fonte: "FACEBOOK", marchio: "P&C",
  richiamoIl: new Date(Date.now() + 2 * 86400000), appuntamentoIl: new Date(Date.now() + 5 * 86400000), indirizzoAppuntamento: "Via Roma 10, 10098 Rivoli",
  note: "Interessato anche alle zanzariere", venditore: { nome: "Marco Piccatti", telefono: "333 0000000", email: "marco.piccatti@gruppopec.com" },
};
const NOME_PERCORSO: Record<string, string> = { NUOVO: "Nuovo lead", ASSEGNA_VENDITORE_CASA: "Appuntamento a casa senza venditore", ASSEGNA_VENDITORE_SHOWROOM: "Appuntamento in showroom senza venditore" };
const VARIANTI: Record<string, string[]> = {
  "call-requested": ["initial-prequalification", "scheduled-first-contact", "call-unanswered-reminder"],
  "appointment-confirmed-contact": ["CASA", "SHOWROOM"], "appointment-reminder-contact": ["CASA", "SHOWROOM"],
};
const descriviQuando = (q: Quando) =>
  "subito" in q ? "subito"
    : "dopoGiorni" in q ? `dopo almeno ${q.dopoGiorni} giorn${q.dopoGiorni === 1 ? "o" : "i"}, alle 08:00 (lun–${q.conSabato === false ? "ven" : "sab"})`
      : "giornoDopo" in q ? "il giorno lavorativo dopo, alle 08:00"
      : "daAppuntamento" in q ? "il giorno prima dell'appuntamento, alla stessa ora"
        : `giorno del ricontatto${q.daRichiamo ? ` +${q.daRichiamo}` : ""}`;

/** Email automatiche dei lead: accensione, stato della posta, registro e anteprima dei testi. */
export default async function AutomazioniPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") notFound();
  const p = await searchParams;
  const [stato, perStato, ultime, daVerificare] = await Promise.all([
    statoAutomazioni(),
    prisma.invioProgrammato.groupBy({ by: ["stato"], _count: { _all: true } }),
    prisma.emailLead.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { lead: { select: { id: true, nome: true } } } }),
    prisma.invioProgrammato.findMany({ where: { stato: { in: ["DA_VERIFICARE", "FALLITO"] } }, orderBy: { eseguiDopo: "desc" }, take: 20, include: { lead: { select: { id: true, nome: true } } } }),
  ]);
  const n = (s: string) => perStato.find((x) => x.stato === s)?._count._all ?? 0;
  const link = { lead: "https://crm-gruppo-pc.vercel.app/lead?id=…", disiscrizione: "https://crm-gruppo-pc.vercel.app/api/disiscrizione?…" };

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/impostazioni" className="text-sm text-blue-800 underline">← Impostazioni</Link>
        <h1 className="text-2xl font-bold text-neutral-900">✉️ Email automatiche dei lead</h1>
        <p className="text-sm text-neutral-600">I percorsi di Keap ricostruiti nel CRM: dopo ogni esito registrato in <Link href="/lead" className="underline">Lead da lavorare</Link> partono le email al cliente e i solleciti al centralino, con gli stessi tempi (lun–sab dalle 08:00, chiusura task alle 18:30).</p>
      </div>
      {p.errore === "permesso" && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Solo l&apos;amministratore può cambiare queste impostazioni.</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">{p.ok === "attive" ? "▶️ Email automatiche ACCESE." : "⏸ Email automatiche in PAUSA."}</p>}
      {p.eseguiti && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">Controllo eseguito: {p.eseguiti} invii elaborati, {p.inviate} email spedite.{p.motivo ? ` (${p.motivo})` : ""}</p>}

      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${stato.attive ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{stato.attive ? "▶️ Accese" : "⏸ In pausa"}</span>
          <span className={`text-sm px-3 py-1 rounded-full ${stato.posta ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{stato.posta ? "Posta (SMTP) configurata" : "Posta (SMTP) NON configurata su Vercel"}</span>
          <form action={impostaAutomazioni}>
            <input type="hidden" name="attive" value={stato.attive ? "0" : "1"} />
            <button className={`btn-3d ${stato.attive ? "btn-3d-amber" : "btn-3d-green"} text-sm px-4 py-2`}>{stato.attive ? "Metti in pausa" : "Accendi le email automatiche"}</button>
          </form>
          <form action={eseguiOra}><button className="btn-3d btn-3d-outline text-sm px-4 py-2">Esegui ora gli invii scaduti</button></form>
        </div>
        <p className="text-xs text-neutral-600">⚠️ <b>Prima di accendere, spegnete in Keap le stesse automazioni</b>, altrimenti i clienti riceveranno le email due volte. In pausa gli esiti si registrano e gli invii restano programmati; alla riaccensione quelli in ritardo di oltre 24 ore non partono da soli (si vedono qui sotto da verificare).</p>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <p>Mittente verso i clienti: <b>{CONTATTI.mittenteClienti}</b></p>
          <p>Mittente interno: <b>{CONTATTI.mittenteInterne}</b></p>
          <p>Casella del centralino: <b>{CONTATTI.centralino}</b></p>
          <p>Telefoni nelle email: <b>{CONTATTI.telefonoUfficio}</b> · {CONTATTI.cellulariUfficio}</p>
        </div>
        <p className="text-sm">Invii programmati: <b>{n("IN_ATTESA")}</b> in attesa · {n("FATTO")} fatti · {n("ANNULLATO")} annullati da un nuovo esito · <span className={n("DA_VERIFICARE") + n("FALLITO") ? "text-red-700 font-semibold" : ""}>{n("DA_VERIFICARE") + n("FALLITO")} da verificare</span></p>
      </div>

      {daVerificare.length > 0 && (
        <div className="card-fase bg-white rounded-lg border border-red-200 p-4">
          <p className="font-semibold text-red-800 mb-2">Da verificare</p>
          {daVerificare.map((i) => <p key={i.id} className="text-sm">{quando(i.eseguiDopo)} · <Link href={`/lead?id=${i.lead.id}`} className="underline">{i.lead.nome}</Link> · {PERCORSI[i.percorso]?.[i.passo]?.nome ?? i.percorso} · {i.errore}</p>)}
        </div>
      )}

      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4">
        <p className="font-semibold mb-2">Ultime email</p>
        {ultime.map((e) => (
          <p key={e.id} className="text-sm border-b border-neutral-100 py-1">{quando(e.createdAt)} · <Link href={`/lead?id=${e.lead.id}`} className="underline">{e.lead.nome}</Link> · {e.categoria === "CLIENTE" ? "al cliente" : "interna"} · {e.oggetto} · <b>{e.stato}</b>{e.motivo ? ` (${e.motivo})` : ""}</p>
        ))}
        {!ultime.length && <p className="text-sm text-neutral-600">Nessuna email ancora.</p>}
      </div>

      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <p className="font-semibold">Percorsi e testi (anteprima con dati di esempio)</p>
        {Object.entries(PERCORSI).filter(([, passi]) => passi.length).map(([k, passi]) => (
          <div key={k} className="text-sm">
            <p className="font-medium">{NOME_PERCORSO[k] ?? ESITI[k]?.nome ?? k}</p>
            <ol className="list-decimal ml-5 text-neutral-700">{passi.map((x, n) => <li key={n}>{x.nome} — {descriviQuando(x.quando)}{x.tipo === "EMAIL" && x.condizione === "PRIMA_DEL_PROMEMORIA" ? " (solo se c'è tempo prima del promemoria)" : ""}</li>)}</ol>
          </div>
        ))}
        {Object.keys(MODELLI).flatMap((m) => (VARIANTI[m] ?? [undefined]).map((v) => ({ m, v }))).map(({ m, v }) => {
          const e = componiEmail(m, ESEMPIO, link, v);
          return (
            <details key={`${m}-${v}`} className="border border-neutral-200 rounded p-2">
              <summary className="text-sm cursor-pointer"><b>{e.oggetto}</b> <span className="text-xs text-neutral-500">({e.categoria === "CLIENTE" ? "al cliente" : "interna"} · {m}{v ? ` · ${v}` : ""} · v{e.versione})</span></summary>
              <pre className="whitespace-pre-wrap text-xs text-neutral-800 mt-2 font-sans">{e.testo}</pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}
