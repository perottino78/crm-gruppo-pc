export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { statoAutomazioni, mesiRecupero, promozioneValida, CHIAVE_PROMO_TESTO, CHIAVE_PROMO_FINO } from "@/lib/automazioni/motore";
import { MAX_RECUPERI } from "@/lib/automazioni/percorsi";
import { PERCORSI, ESITI, type Quando } from "@/lib/automazioni/percorsi";
import { CONTATTI, MODELLI, componiEmail } from "@/lib/automazioni/email";
import { impostaAutomazioni, eseguiOra, salvaRecupero } from "@/app/lead-percorso-actions";
import { salvaPromemoriaCampagne } from "@/app/campagne-actions";
import { impostazioniPromemoria } from "@/lib/campagne/motore";
import { salvaPostaAziendale } from "@/app/posta-actions";
import { postaAziendale } from "@/lib/mail/invio";
import { HOST_PREDEFINITO, PORTA_PREDEFINITA } from "@/lib/mail/caselle";

type P = { posta?: string; postaErrore?: string; prove?: string; u?: string; h?: string; pt?: string; m?: string; ac?: string; promemoria?: string; recupero?: string; ok?: string; eseguiti?: string; inviate?: string; motivo?: string; errore?: string };
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ESEMPIO_PROMO = { testo: "• Sconto in fattura sulle pergole bioclimatiche\n• Finanziamento su misura sugli infissi", validaFino: new Date(Date.now() + 30 * 86400000) };
const ESEMPIO = {
  promozione: ESEMPIO_PROMO, recuperoIl: new Date(Date.now() - 3 * 86400000),
  nome: "Mario Rossi", telefono: "333 1234567", email: "mario.rossi@email.it", comune: "Rivoli", cap: "10098", prodotto: "Pergola bioclimatica", fonte: "FACEBOOK", marchio: "P&C",
  richiamoIl: new Date(Date.now() + 2 * 86400000), appuntamentoIl: new Date(Date.now() + 5 * 86400000), indirizzoAppuntamento: "Via Roma 10, 10098 Rivoli",
  note: "Interessato anche alle zanzariere", venditore: { nome: "Marco Piccatti", telefono: "333 0000000", email: "marco.piccatti@gruppopec.com" },
};
const NOME_PERCORSO: Record<string, string> = { RECUPERO: "Lead recuperato (dopo la promozione)", NUOVO: "Nuovo lead", ASSEGNA_VENDITORE_CASA: "Appuntamento a casa senza venditore", ASSEGNA_VENDITORE_SHOWROOM: "Appuntamento in showroom senza venditore" };
const VARIANTI: Record<string, string[]> = {
  "call-requested": ["initial-prequalification", "scheduled-first-contact", "call-unanswered-reminder"],
  "appointment-confirmed-contact": ["CASA", "SHOWROOM"], "appointment-reminder-contact": ["CASA", "SHOWROOM"],
};
const descriviQuando = (q: Quando) =>
  "subito" in q ? "subito"
    : "dopoGiorni" in q ? `dopo almeno ${q.dopoGiorni} giorn${q.dopoGiorni === 1 ? "o" : "i"}, alle 08:00 (lun–${q.conSabato === false ? "ven" : "sab"})`
      : "giornoDopo" in q ? "il giorno lavorativo dopo, alle 08:00"
      : "dopoMesi" in q ? "dopo i mesi di recupero impostati qui sopra, un giorno feriale alle 10:00"
      : "daAppuntamento" in q ? "il giorno prima dell'appuntamento, alla stessa ora"
        : `giorno del ricontatto${q.daRichiamo ? ` +${q.daRichiamo}` : ""}`;

/** Email automatiche dei lead: accensione, stato della posta, registro e anteprima dei testi. */
export default async function AutomazioniPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || !puoMarketing(u)) notFound();
  const admin = u.ruolo === "AMMINISTRATORE";
  const p = await searchParams;
  const [stato, perStato, ultime, daVerificare, mesi, promo, testoPromo, finoPromo, inAttesa, avvisi] = await Promise.all([
    statoAutomazioni(),
    prisma.invioProgrammato.groupBy({ by: ["stato"], _count: { _all: true } }),
    prisma.emailLead.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { lead: { select: { id: true, nome: true } } } }),
    prisma.invioProgrammato.findMany({ where: { stato: { in: ["DA_VERIFICARE", "FALLITO"] } }, orderBy: { eseguiDopo: "desc" }, take: 20, include: { lead: { select: { id: true, nome: true } } } }),
    mesiRecupero(),
    promozioneValida(new Date()),
    prisma.configurazione.findUnique({ where: { chiave: CHIAVE_PROMO_TESTO } }),
    prisma.configurazione.findUnique({ where: { chiave: CHIAVE_PROMO_FINO } }),
    prisma.invioProgrammato.findMany({ where: { stato: "IN_ATTESA" }, orderBy: { eseguiDopo: "asc" }, select: { percorso: true, passo: true, eseguiDopo: true, errore: true } }),
    impostazioniPromemoria(),
  ]);
  const [posta, postaNelCrm, caselle] = await Promise.all([
    postaAziendale(),
    prisma.configurazione.findUnique({ where: { chiave: "posta_utente" } }),
    prisma.utente.groupBy({ by: ["smtpErrore"], where: { smtpPassword: { not: null } }, _count: { _all: true } }),
  ]);
  const caselleOk = caselle.filter((c) => !c.smtpErrore).reduce((t, c) => t + c._count._all, 0);
  const caselleKo = caselle.filter((c) => c.smtpErrore).reduce((t, c) => t + c._count._all, 0);
  // recuperi programmati: i passi di tipo RECUPERO in attesa
  const recuperi = inAttesa.filter((i) => PERCORSI[i.percorso]?.[i.passo]?.tipo === "RECUPERO");
  const n = (s: string) => perStato.find((x) => x.stato === s)?._count._all ?? 0;
  const link = { lead: "https://crm-gruppo-pc.vercel.app/lead?id=…", disiscrizione: "https://crm-gruppo-pc.vercel.app/api/disiscrizione?…" };

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href={admin ? "/impostazioni" : "/marketing"} className="text-sm text-blue-800 underline">← {admin ? "Impostazioni" : "Marketing"}</Link>
        <h1 className="text-2xl font-bold text-neutral-900">✉️ Email automatiche dei lead</h1>
        <p className="text-sm text-neutral-600">I percorsi di Keap ricostruiti nel CRM: dopo ogni esito registrato in <Link href="/lead" className="underline">Lead da lavorare</Link> partono le email al cliente e i solleciti al centralino, con gli stessi tempi (lun–sab dalle 08:00, chiusura task alle 18:30).</p>
      </div>
      {p.errore === "permesso" && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Solo amministrazione e marketing possono cambiare queste impostazioni.</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">{p.ok === "attive" ? "▶️ Email automatiche ACCESE." : "⏸ Email automatiche in PAUSA."}</p>}
      {p.eseguiti && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">Controllo eseguito: {p.eseguiti} invii elaborati, {p.inviate} email spedite.{p.motivo ? ` (${p.motivo})` : ""}</p>}

      {admin && <div id="posta" className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">📮 Posta aziendale</p>
          <span className={`text-sm px-3 py-1 rounded-full ${posta ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {posta ? `✓ collegata: ${posta.utente} (${postaNelCrm ? "impostata qui" : "impostata su Vercel"})` : "non collegata: nessuna email parte"}
          </span>
        </div>
        <p className="text-sm text-neutral-600">
          La casella da cui partono le email del CRM (avvisi agli uffici, email automatiche, campagne) e quelle di chi non ha collegato la sua.
          Si imposta una volta sola: il CRM la prova con un&apos;email a te prima di salvarla. Ogni collega può poi collegare la propria casella
          dal suo <Link href="/profilo#posta" className="underline">Profilo</Link> (oppure lo fai tu in <Link href="/impostazioni" className="underline">Impostazioni › Utenti</Link>):
          basta la password della sua email. Caselle personali collegate: <b>{caselleOk}</b>{caselleKo ? <span className="text-red-700"> · {caselleKo} non funzionano</span> : null}.
        </p>
        {p.posta && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.posta}</p>}
        {p.postaErrore && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1">
            <p>{p.postaErrore}</p>
            {p.prove && <details><summary className="cursor-pointer text-xs">Prove fatte dal CRM ({p.prove.split("\n").length})</summary><pre className="text-[11px] whitespace-pre-wrap text-neutral-700 mt-1">{p.prove}</pre></details>}
            <p className="text-xs">Riscrivi la password e riprova.</p>
          </div>
        )}
        <form action={salvaPostaAziendale} className="grid sm:grid-cols-4 gap-2 items-end">
          <label className="text-xs text-neutral-600 sm:col-span-2">Casella (email)
            <input name="utente" type="email" defaultValue={p.u ?? posta?.utente ?? ""} placeholder="es. crm@gruppopec.com" className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-600 sm:col-span-2">Password
            <input name="password" type="password" autoComplete="new-password" placeholder={postaNelCrm ? "•••••••• (lascia vuoto per non cambiarla)" : ""} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-600 sm:col-span-2">Server in uscita (SMTP)
            <input name="host" defaultValue={p.h ?? posta?.host ?? HOST_PREDEFINITO} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Porta
            <input name="porta" inputMode="numeric" defaultValue={p.pt ?? posta?.porta ?? PORTA_PREDEFINITA} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Nome mittente
            <input name="mittente" defaultValue={p.m ?? posta?.mittente ?? ""} placeholder="Gruppo P&C <crm@gruppopec.com>" className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-700 sm:col-span-4 flex items-start gap-2">
            <input type="checkbox" name="accettaCertificato" defaultChecked={p.ac === "1" || !!posta?.accettaCertificato} className="mt-0.5" />
            <span>Collega comunque se il server ha un certificato di sicurezza non riconosciuto (succede con molti hosting: la posta resta cifrata). Il CRM lo usa solo se senza non funziona.</span>
          </label>
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2 sm:col-span-4 justify-self-start">Salva e manda una prova</button>
          <p className="text-[11px] text-neutral-500 sm:col-span-4">Se la prova non va, il CRM prova da solo il nome del server indicato nel certificato, l&apos;altra porta (465 SSL / 587 STARTTLS) e salva le impostazioni che funzionano.</p>
        </form>
      </div>}

      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${stato.attive ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{stato.attive ? "▶️ Accese" : "⏸ In pausa"}</span>
          <span className={`text-sm px-3 py-1 rounded-full ${stato.posta ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{stato.posta ? "Posta aziendale collegata" : `Posta aziendale NON collegata (${admin ? "vedi sotto" : "la collega l'amministratore"})`}</span>
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

      {p.recupero && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">♻️ Impostazioni del recupero salvate.</p>}
      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <p className="font-semibold">♻️ Recupero dei lead persi</p>
        <p className="text-sm text-neutral-600">
          I lead &quot;non interessato&quot; e quelli rimasti &quot;non gestiti&quot; dopo i solleciti, passati i mesi indicati, ricevono una email con la promozione
          del momento e tornano nella coda delle telefoniste come <b>Da recuperare</b> (3 solleciti al centralino). Al massimo {MAX_RECUPERI} recuperi per lead;
          chi si è disiscritto non riceve l&apos;email ma viene comunque richiamato. Senza una promozione valida il recupero aspetta: il CRM non inventa offerte.
        </p>
        <p className={`text-sm font-semibold ${promo ? "text-green-800" : "text-red-700"}`}>
          {promo ? `✅ Promozione valida fino al ${promo.validaFino.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : "⚠️ Nessuna promozione valida: i recuperi restano in attesa"}
          {" · "}{recuperi.length} recuperi programmati{recuperi[0] ? `, il prossimo ${quando(recuperi[0].eseguiDopo)}` : ""}
        </p>
        <form action={salvaRecupero} className="space-y-2">
          <label className="text-sm block">Recupero dopo quanti mesi
            <input name="mesi" type="number" min={1} max={24} defaultValue={mesi} className="ml-2 w-20 border border-neutral-300 rounded px-2 py-1 text-sm" />
          </label>
          <label className="text-sm block">Promozione del momento (il testo che il cliente legge nell&apos;email)
            <textarea name="testo" rows={5} defaultValue={testoPromo?.valore ?? ""} placeholder={"es. • Sconto in fattura del 50% sulle pergole bioclimatiche\n• Finanziamento a tasso zero in 12 mesi sugli infissi"} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm block">Valida fino al
            <input name="fino" type="date" defaultValue={finoPromo?.valore ?? ""} className="ml-2 border border-neutral-300 rounded px-2 py-1 text-sm" />
          </label>
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2">Salva recupero e promozione</button>
        </form>
      </div>

      {p.promemoria && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">⏰ Avvisi di scadenza salvati.</p>}
      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-2">
        <p className="font-semibold">⏰ Avvisi di scadenza delle campagne e della promozione del recupero</p>
        <p className="text-sm text-neutral-600">Quando una <Link href="/campagne" className="underline">campagna</Link> o la promozione del recupero sta per scadere, arriva un&apos;email per ricordarvi di aggiornarla.</p>
        <form action={salvaPromemoriaCampagne} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Quanti giorni prima (separati da virgola)
            <input name="giorni" defaultValue={avvisi.giorni.join(",")} placeholder="3,2,1" className="block border border-neutral-300 rounded px-2 py-1.5 text-sm w-40" />
          </label>
          <label className="text-sm">A chi mandare l&apos;avviso (più indirizzi separati da virgola)
            <input name="a" defaultValue={avvisi.a.join(", ")} className="block border border-neutral-300 rounded px-2 py-1.5 text-sm w-96" />
          </label>
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2">Salva avvisi</button>
        </form>
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
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Percorsi e testi (anteprima con dati di esempio)</p><Link href="/marketing/email" className="btn-3d btn-3d-purple text-sm px-4 py-2">✏️ Modifica i testi delle email</Link></div>
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
