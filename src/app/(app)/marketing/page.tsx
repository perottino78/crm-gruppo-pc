export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { PERCORSI, FASI_LEAD } from "@/lib/automazioni/percorsi";
import { statoAutomazioni, promozioneValida, testiPersonalizzati } from "@/lib/automazioni/motore";
import { chiaveTesto, NOMI_EMAIL, NOMI_VARIANTI, varianteTesto } from "@/lib/automazioni/personalizza";
import { Barre } from "@/components/report/Grafici";
import { somma } from "@/lib/report/calcoli";

const GIORNO = 86400000;

// Il percorso del lead a tappe (come la tela delle campagne di Keap): fasi del lead e percorsi automatici di ogni tappa
const TAPPE: { titolo: string; colore: string; fasi: string[]; percorsi: string[]; spiega: string }[] = [
  { titolo: "1 · Arriva il lead", colore: "#2563eb", fasi: ["NUOVO"], percorsi: ["NUOVO"], spiega: "Da Facebook, sito, landing o simulatore: avviso al centralino per classificarlo." },
  { titolo: "2 · Classificazione", colore: "#0d9488", fasi: ["IN_TARGET", "FUORI_REGIONE"], percorsi: ["IN_TARGET", "FUORI_REGIONE"], spiega: "In target: grazie al cliente e chiamata. Fuori regione: email di cortesia." },
  { titolo: "3 · Telefonate", colore: "#ca8a04", fasi: ["NON_RISPONDE", "DA_RICHIAMARE"], percorsi: ["NON_RISPONDE", "DA_RICHIAMARE"], spiega: "Solleciti al centralino e email «abbiamo provato a chiamarti» / «ti richiameremo»." },
  { titolo: "4 · Appuntamento", colore: "#ea580c", fasi: ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "APPUNTAMENTO_FISSATO"], percorsi: ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "ASSEGNA_VENDITORE_CASA", "APPUNTAMENTO_ANNULLATO"], spiega: "Conferme a cliente e venditore, 4 lettere di vendita, promemoria il giorno prima." },
  { titolo: "5 · Non interessato e recupero", colore: "#7c3aed", fasi: ["NON_INTERESSATO", "RECUPERO"], percorsi: ["NON_INTERESSATO", "RECUPERO"], spiega: "Email di saluto; dopo qualche mese la promozione del momento e una nuova chiamata." },
];

function Numero({ titolo, valore, sotto }: { titolo: string; valore: string; sotto?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,0.06)]">
      <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{titolo}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-neutral-900">{valore}</div>
      {sotto && <div className="text-xs text-neutral-600">{sotto}</div>}
    </div>
  );
}

export default async function MarketingPage() {
  const u = await getCurrentUser();
  if (!u || !puoMarketing(u)) notFound();
  const da30 = new Date(Date.now() - 30 * GIORNO);
  const [perFase, lead30, email30, disiscritti, campagne, stato, promo, testi] = await Promise.all([
    prisma.lead.groupBy({ by: ["fase"], _count: { _all: true } }),
    prisma.lead.findMany({ where: { createdAt: { gte: da30 } }, select: { fonte: true, fase: true, brand: { select: { nome: true } } } }),
    prisma.emailLead.groupBy({ by: ["stato"], where: { createdAt: { gte: da30 } }, _count: { _all: true } }),
    prisma.cliente.count({ where: { disiscritto: true } }),
    prisma.campagna.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, nome: true, stato: true, validaFino: true, _count: { select: { invii: true } } } }),
    statoAutomazioni(),
    promozioneValida(new Date()),
    testiPersonalizzati(),
  ]);
  const fase = (f: string) => perFase.find((x) => x.fase === f)?._count._all ?? 0;
  const appuntamenti30 = lead30.filter((l) => l.fase.startsWith("APPUNTAMENTO")).length;
  const inviate30 = email30.find((x) => x.stato === "INVIATA")?._count._all ?? 0;

  const sezioni: [string, string, string, string][] = [
    ["/lead", "📞", "Lead da lavorare", "La coda delle telefoniste, esiti e storico di ogni contatto"],
    ["/clienti", "👥", "Contatti e filtri", "Tutti i clienti: provenienza, stato, commerciale; esporta per Excel o per i pubblici di Meta"],
    ["/campagne", "📣", "Campagne email", "Invii ai clienti filtrati per marchio, stato e provenienza, con scadenza e avvisi"],
    ["/impostazioni/automazioni", "⚙️", "Email automatiche", "Accensione, promozione del recupero, avvisi di scadenza, registro degli invii"],
    ["/marketing/email", "✏️", "Testi delle email", "Modifica oggetto e testo di ogni email del percorso, con anteprima"],
    ["/impostazioni/lead", "🔗", "Pagine di atterraggio e collegamenti", "Link per le inserzioni, Meta Lead Ads, chiave per il gestionale pubblicità"],
    ["/prodotti", "📦", "Listini e prodotti", "Carica listini e articoli dei fornitori, applica gli aumenti"],
    ["/impostazioni", "🧑‍🤝‍🧑", "Team", "Vedi il team e aggiungi nuovi colleghi"],
  ];

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">🚀 Marketing</h1>
        <p className="text-sm text-neutral-600">Il centro di controllo dei lead: da dove arrivano, a che punto sono, quali email partono da sole e con che testo. Come Keap, ma dentro il CRM.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${stato.attive ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{stato.attive ? "▶️ Email automatiche accese" : "⏸ Email automatiche in pausa"}</span>
        <span className={`rounded-full px-3 py-1 ${stato.posta ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{stato.posta ? "Posta collegata" : "Posta non collegata"}</span>
        <span className={`rounded-full px-3 py-1 ${promo ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{promo ? `Promozione valida fino al ${promo.validaFino.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : "⚠ Nessuna promozione valida per il recupero"}</span>
        <Link href="/impostazioni/automazioni" className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Gestisci</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero titolo="Nuovi lead (30 giorni)" valore={String(lead30.length)} sotto={`${fase("NUOVO")} ancora da classificare`} />
        <Numero titolo="Appuntamenti (30 giorni)" valore={String(appuntamenti30)} sotto={lead30.length ? `${Math.round((appuntamenti30 / lead30.length) * 100)}% dei nuovi lead` : undefined} />
        <Numero titolo="Email automatiche inviate" valore={String(inviate30)} sotto="ultimi 30 giorni" />
        <Numero titolo="Disiscritti" valore={String(disiscritti)} sotto="clienti che non ricevono email" />
      </div>

      <section className="card-fase" style={{ ["--fase" as string]: "#ea580c" }}>
        <h2>🧭 Il percorso del lead</h2>
        <p className="mt-1 mb-3 text-xs text-neutral-600">Ogni tappa: quanti lead ci sono adesso e quali email partono da sole. Clicca un&apos;email per cambiarne il testo (✏️ = già personalizzata).</p>
        <div className="grid gap-3 md:grid-cols-5">
          {TAPPE.map((t) => {
            const email = t.percorsi.flatMap((k) => (PERCORSI[k] ?? []).filter((p) => p.tipo === "EMAIL").map((p) => p as { modello: string; variante?: string; nome: string; a: string }));
            const uniche = [...new Map(email.map((e) => [`${e.modello}|${e.variante ?? ""}`, e])).values()];
            return (
              <div key={t.titolo} className="relative rounded-xl border-2 bg-white p-3" style={{ borderColor: t.colore }}>
                <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: t.colore }}>{t.titolo}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.fasi.map((f) => <Link key={f} href={`/lead?fase=${f}`} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-200">{FASI_LEAD[f]?.nome ?? f.replace(/_/g, " ").toLowerCase()}: {fase(f)}</Link>)}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-neutral-600">{t.spiega}</p>
                <ul className="mt-2 space-y-1">
                  {uniche.map((e) => {
                    const k = chiaveTesto(e.modello, e.modello === "sales-letter-1" ? "PC" : varianteTesto(e.modello, e.variante, {}));
                    return (
                      <li key={`${e.modello}${e.variante ?? ""}`}>
                        <Link href={`/marketing/email?aperta=${encodeURIComponent(k)}#${encodeURIComponent(k)}`} className="block rounded border border-neutral-200 px-2 py-1 text-[11px] leading-4 hover:border-neutral-400 hover:bg-neutral-50">
                          {e.a === "CLIENTE" ? "📨" : "🏢"} {NOMI_EMAIL[e.modello] ?? e.nome}{e.variante && NOMI_VARIANTI[e.variante] ? ` · ${NOMI_VARIANTI[e.variante]}` : ""}{testi.has(k) ? " ✏️" : ""}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card-fase" style={{ ["--fase" as string]: "#2563eb" }}>
          <h2>📥 Da dove arrivano (30 giorni)</h2>
          <div className="mt-3"><Barre voci={somma(lead30, (l) => l.fonte || "non indicata", () => 1).map((v) => ({ etichetta: v.chiave, valore: v.valore, nota: `${Math.round(v.quota * 100)}%` }))} unita="numero" vuoto="Nessun lead negli ultimi 30 giorni." /></div>
        </section>
        <section className="card-fase" style={{ ["--fase" as string]: "#16a34a" }}>
          <h2>🏷️ Per marchio (30 giorni)</h2>
          <div className="mt-3"><Barre voci={somma(lead30, (l) => l.brand.nome, () => 1).map((v) => ({ etichetta: v.chiave, valore: v.valore, nota: `${Math.round(v.quota * 100)}%` }))} unita="numero" vuoto="Nessun lead negli ultimi 30 giorni." /></div>
        </section>
      </div>

      <section className="card-fase" style={{ ["--fase" as string]: "#0d9488" }}>
        <h2>📣 Ultime campagne</h2>
        <div className="mt-3 divide-y divide-neutral-100 text-sm">
          {campagne.map((c) => (
            <Link key={c.id} href={`/campagne/${c.id}`} className="flex flex-wrap justify-between gap-2 py-1.5 hover:bg-neutral-50">
              <b>{c.nome}</b>
              <span className="text-xs text-neutral-600">{c.stato.toLowerCase().replace("_", " ")} · {c._count.invii} invii{c.validaFino ? ` · valida fino al ${c.validaFino.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}</span>
            </Link>
          ))}
          {!campagne.length && <p className="text-neutral-500">Nessuna campagna ancora.</p>}
        </div>
        <Link href="/campagne" className="btn-3d btn-3d-teal mt-3 inline-block px-4 py-2 text-sm">+ Nuova campagna</Link>
      </section>

      <section className="card-fase" style={{ ["--fase" as string]: "#334155" }}>
        <h2>🧰 Strumenti del marketing</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {sezioni.map(([href, icona, titolo, testo]) => (
            <Link key={href} href={href} className="tile-3d border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50">
              <span className="text-2xl">{icona}</span>
              <span>{titolo}</span>
              <span className="text-[11px] font-normal leading-4 text-neutral-600">{testo}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
