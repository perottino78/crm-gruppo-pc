export const dynamic = "force-dynamic";

import { percentuale } from "@/lib/numeri";
import BottoneConferma from "@/components/BottoneConferma";
import { prisma } from "@/lib/prisma";
import Documenti from "@/components/documenti/Documenti";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import PannelloConferma from "@/components/preventivi/PannelloConferma";
import { numeroCommessa } from "@/lib/commesse";
import { scopePreventivoWhere } from "@/lib/scope";
import { brandInfo } from "@/lib/brands";
import { listiniFidra, GUIDA_FIDRA, CATALOGHI_FIDRA } from "@/lib/listini/fidra";
import { listiniOptima, GUIDA_OPTIMA, CATALOGHI_OPTIMA } from "@/lib/listini/optima";
import { GUIDA_PORTE_VETRO } from "@/lib/listini/porte-vetro";
import { GUIDA_TEMPRA } from "@/lib/listini/tempra";
import { GUIDA_TAGLIO_FREDDO } from "@/lib/listini/taglio-freddo";
import { GUIDA_PEDANE } from "@/lib/listini/pedane";
import { GUIDA_PAVGAL, listiniPavgal } from "@/lib/listini/pavimenti-galleggianti";
import { listiniRasomuro, guidaRasomuro, CATALOGHI_RASOMURO } from "@/lib/listini/rasomuro";
import { unitaMisura, listinoDiTipologia, famigliaColoreStruttura, etichetteDimensioni, haMisura, sottogruppoDiTipologia, labelBreveTipologia, finituraDiTipologia, assiSelezioneZpc, assiSelezioneUragano, assiSelezioneVerticale, assiSelezioneModelloAnte, assiSelezionePersianeBlindate, assiSelezioneKopen, assiSelezioneIsomax, assiSelezioneMinibox, assiSelezioneTapparelle, assiSelezioneWpc, assiSelezioneSeraFrangisole, optionalSeraFrangisoleApplicabile, assiSelezioneAccessoriTapparelle, assiSelezioneBlindati, assiSelezioneZenith, assiSelezioneRullo, assiSelezionePergola, assiSelezioneVetrata, assiSelezioneBioclimatica, slugTessutoRullo, RULLO_TESSUTO_LABELS, notaInArrivo } from "@/lib/prodotti";
import SelettoreImmagine from "@/components/SelettoreImmagine";
import SelectAutoInvio from "@/components/SelectAutoInvio";
import FormAutoSalva from "@/components/FormAutoSalva";
import { schedeDelleTipologie } from "@/lib/preventivi/scheda-cliente";
import AggiungiRiga from "@/components/preventivi/AggiungiRiga";
import RigaTesto from "@/components/preventivi/RigaTesto";
import FinestraOptional from "@/components/preventivi/FinestraOptional";
import { CONDIZIONI_PAGAMENTO_DEFAULT, CONDIZIONI_CONSEGNA_DEFAULT, NOTA_FATTIBILITA, CLAUSOLA_ISTRUTTORIA } from "@/lib/condizioniOfferta";
import {
  aggiungiRigaPreventivo,
  aggiungiRigaPreventivoPerMisura,
  rimuoviRigaPreventivo,
  aggiungiOptionalARiga,
  rimuoviOptionalDaRiga,
  aggiornaStatoPreventivo,
  toggleDescrizioneRiga,
  aggiornaDescrizionePersonalizzata,
  aggiornaCondizioniOfferta,
  aggiornaImmagineOfferta,
  aggiornaSchedeAllegate,
  aggiornaSconto,
  aggiornaIva,
  aggiornaPrezzoManuale,
  aggiungiRigaTestoLibero,
  creaSezione,
  rinominaSezione,
  eliminaSezione,
  spostaRigaSu,
  spostaRigaGiu,
  spostaRigaSezione,
  spostaSezioneSu,
  spostaSezioneGiu,
  creaProgettoSolaris,
  importaSolarisInPreventivo,
  duplicaPreventivo,
  archiviaPreventivo,
  ripristinaPreventivo,
  eliminaPreventivo,
  aggiornaScadenzaPreventivo,
} from "@/app/actions";
import SelettoreProdotto from "@/components/SelettoreProdotto";
import { tassonomiaListino, GRUPPI_TENDE_CON_TESSUTO } from "@/lib/listini/tassonomia";
import RigaAzioni from "@/components/RigaAzioni";
import AvvisoMisuraFuoriListino from "@/components/AvvisoMisuraFuoriListino";
import { SelettorePannelliBlindati } from "@/components/SelettorePannelliBlindati";
import { SelettorePannelliInterniBlindati } from "@/components/SelettorePannelliInterniBlindati";
import { SelettoreTessuti } from "@/components/SelettoreTessuti";
import { SelettoreColoreTessutoRullo } from "@/components/SelettoreColoreTessutoRullo";
import { SelettoreMotori } from "@/components/SelettoreMotori";
import { SelettoreAccessoriMotore } from "@/components/SelettoreAccessoriMotore";


const STATI = ["APERTO", "ACCETTATO", "SCADUTO", "ANNULLATO"];
const NOMI_STATO: Record<string, string> = { APERTO: "Aperta", ACCETTATO: "Accettata", SCADUTO: "Scaduta", ANNULLATO: "Annullata" };

export default async function PreventivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; errore?: string; confermata?: string; inviata?: string; variante?: string; firma?: string; sezione?: string }>;
}) {
  const { id } = await params;
  const { q, errore, confermata, inviata, variante, firma, sezione: sezioneParam } = await searchParams;
  const utenteCorrente = await getCurrentUser();
  if (!utenteCorrente) notFound();

  const preventivo = await prisma.preventivo.findFirst({
    where: { id, ...scopePreventivoWhere(utenteCorrente) },
    include: {
      cliente: true,
      brand: true,
      commerciale: true,
      emailInviate: { orderBy: { createdAt: "desc" }, take: 10 },
      righe: {
        include: { prodotto: true, optionali: { include: { optional: true } } },
        orderBy: [{ ordine: "asc" }, { id: "asc" }],
      },
      sezioni: { orderBy: [{ ordine: "asc" }, { id: "asc" }] },
      solarisProgetto: { select: { id: true } },
      commessa: { select: { id: true, numero: true, anno: true, tasks: { where: { completatoIl: null, stato: { not: "ANNULLATO" } }, orderBy: { createdAt: "desc" }, take: 1, select: { titolo: true, ufficio: true } } } },
    },
  });
  if (!preventivo) notFound();
  const bloccata = !!preventivo.confermatoIl;
  // «Il cliente ha firmato?» solo quando l'offerta esiste davvero per il cliente (inviata o già confermata):
  // mentre la si costruisce non serve (richiesta di Rocco); con ?firma=1 si apre lo stesso (firmato su carta)
  const mostraFirma = firma === "1" || !!preventivo.inviatoIl || !!preventivo.confermatoIl || !!preventivo.commessa || preventivo.stato !== "APERTO";
  const [nContratto, nFoto] = await Promise.all([
    prisma.documento.count({ where: { entita: "PREVENTIVO", entitaId: preventivo.id, cartella: "Contratto firmato" } }),
    prisma.documento.count({ where: { entita: "PREVENTIVO", entitaId: preventivo.id, cartella: "Foto" } }),
  ]);

  const [optionaliDisponibili, prodottiTrovati, tassonomia] = await Promise.all([
    prisma.optional.findMany({ where: { brandId: preventivo.brandId, attivo: true }, orderBy: [{ categoria: "asc" }, { nome: "asc" }] }),
    q
      ? prisma.prodotto.findMany({
          where: {
            brandId: preventivo.brandId,
            OR: [
              { tipologia: { contains: q, mode: "insensitive" as const } },
              { colore: { contains: q, mode: "insensitive" as const } },
            ],
          },
          take: 25,
          orderBy: [{ tipologia: "asc" }, { altezzaMm: "asc" }],
        })
      : [],
    tassonomiaListino(preventivo.brandId),
  ]);

  const tipologiePresenti = [
    ...new Set(preventivo.righe.filter((r) => r.prodotto).map((r) => r.prodotto!.tipologia)),
  ];
  const modelli = tipologiePresenti.length
    ? await prisma.modelloProdotto.findMany({ where: { brandId: preventivo.brandId, tipologia: { in: tipologiePresenti } } })
    : [];
  const modelloMap = new Map(modelli.map((m) => [m.tipologia, m]));

  const info = brandInfo(preventivo.brand.nome);
  const totaleFinale = preventivo.totaleNetto + preventivo.totaleIva;
  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  // Subtotale di una riga (prodotto o testo libero), stessa formula usata nel
  // rendering della riga — riusato per calcolare il totale di ogni sezione.
  const subtotaleRiga = (r: (typeof preventivo.righe)[number]): number => {
    if (!r.prodotto) return r.quantita * r.prezzoUnitario;
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  };
  const imponibileLordo = preventivo.righe.reduce((t, r) => t + subtotaleRiga(r), 0);
  // stanza in cui va il prossimo prodotto (pulsante «🧩 Prodotto» di una sezione, ?sezione=<id>)
  const sezioneScelta = preventivo.sezioni.find((x) => x.id === sezioneParam) ?? null;

  // Frecce su/giu + tendina "sposta in sezione" mostrate a sinistra di ogni riga
  // (prodotto o testo libero). idx/totale sono la posizione della riga dentro il
  // proprio gruppo (senza-sezione, oppure la singola sezione a cui appartiene).
  const controlliSpostamento = (rigaId: string, sezioneIdCorrente: string | null, idx: number, totale: number) => (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2.5 border-r border-neutral-200 bg-neutral-50 shrink-0 w-[80px]">
      <div className="flex items-center gap-1">
        <form action={spostaRigaSu}>
          <input type="hidden" name="id" value={rigaId} />
          <input type="hidden" name="preventivoId" value={preventivo.id} />
          <button disabled={idx === 0} className="btn-3d btn-3d-outline w-7 h-7 p-0 flex items-center justify-center text-sm" title="sposta su">▲</button>
        </form>
        <form action={spostaRigaGiu}>
          <input type="hidden" name="id" value={rigaId} />
          <input type="hidden" name="preventivoId" value={preventivo.id} />
          <button disabled={idx === totale - 1} className="btn-3d btn-3d-outline w-7 h-7 p-0 flex items-center justify-center text-sm" title="sposta giù">▼</button>
        </form>
      </div>
      {preventivo.sezioni.length > 0 && (
        <form action={spostaRigaSezione} className="flex flex-col items-center gap-1 w-full">
          <input type="hidden" name="id" value={rigaId} />
          <input type="hidden" name="preventivoId" value={preventivo.id} />
          <select name="sezioneId" defaultValue={sezioneIdCorrente ?? ""} className="text-[9px] border border-neutral-300 rounded px-0.5 py-0.5 w-full">
            <option value="">— nessuna —</option>
            {preventivo.sezioni.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <button className="btn-3d btn-3d-teal text-[9px] px-1 py-0.5 w-full leading-tight">sposta →</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl">
      <Link href={`/clienti/${preventivo.clienteId}`} className="text-xs text-neutral-600 hover:underline">
        ← {preventivo.cliente.nome}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900">Preventivo — {preventivo.cliente.nome}</h1>
          <span
            className="text-xs font-medium px-3 py-1.5 rounded-full border"
            style={{ background: info.primarySoft, color: info.primary, borderColor: info.primary }}
          >
            {preventivo.brand.nome}
          </span>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-300">
            {preventivo.numeroOfferta ? `Offerta N° ${preventivo.numeroOfferta}` : "Offerta"} · {preventivo.createdAt.toLocaleDateString("it-IT")}
            {preventivo.duplicatoDaId ? " · copia" : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preventivo.brand.nome === "Solaris" && (
            preventivo.solarisProgetto ? (
              <Link
                href={`/solaris/progetto/${preventivo.solarisProgetto.id}`}
                className="btn-3d btn-3d-green text-sm px-3 py-1.5"
              >
                ☀️ Studio Solaris
              </Link>
            ) : (
              <form action={creaProgettoSolaris}>
                <input type="hidden" name="preventivoId" value={preventivo.id} />
                <button type="submit" className="btn-3d btn-3d-green text-sm px-3 py-1.5">
                  ☀️ Studio Solaris
                </button>
              </form>
            )
          )}
          <form action={duplicaPreventivo}>
            <input type="hidden" name="id" value={preventivo.id} />
            <button type="submit" className="btn-3d btn-3d-blue text-sm px-3 py-1.5" title="Crea una copia con data odierna e nuovo numero offerta">
              📄 Duplica
            </button>
          </form>
          {preventivo.archiviato ? (
            <form action={ripristinaPreventivo}>
              <input type="hidden" name="id" value={preventivo.id} />
              <button type="submit" className="btn-3d btn-3d-green text-sm px-3 py-1.5">♻️ Ripristina</button>
            </form>
          ) : (
            <form action={archiviaPreventivo}>
              <input type="hidden" name="id" value={preventivo.id} />
              <button type="submit" className="btn-3d btn-3d-outline text-sm px-3 py-1.5" title="Sposta l'offerta nell'archivio">🗄️ Archivia</button>
            </form>
          )}
          {!bloccata && (
          <form action={eliminaPreventivo}>
            <input type="hidden" name="id" value={preventivo.id} />
            <BottoneConferma
              messaggio="Eliminare definitivamente questa offerta? L'operazione non si può annullare."
              className="btn-3d btn-3d-red text-sm px-3 py-1.5"
            >
              🗑️ Elimina
            </BottoneConferma>
          </form>
          )}
          <Link
            href={`/preventivi/${preventivo.id}/stampa`}
            target="_blank"
            className="btn-3d btn-3d-dark text-sm px-3 py-1.5"
          >
            🖨️ Stampa offerta
          </Link>
          <Link href={`/preventivi/${preventivo.id}/invia`} className="btn-3d btn-3d-green text-sm px-3 py-1.5">
            ✉️ Invia offerta
          </Link>
        </div>
      </div>

      {inviata && (
        <p className="mb-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ Offerta inviata a {inviata}</p>
      )}
      {preventivo.emailInviate.length > 0 && (
        <details className="mb-4 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">
          <summary className="cursor-pointer">
            ✉️ <b>Inviata</b> il {preventivo.inviatoIl?.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) ?? "—"} a {preventivo.inviatoA ?? "—"}
            {" · "}
            {preventivo.vistoIl
              ? <span className="font-semibold text-green-800">👁️ vista dal cliente {preventivo.visite > 1 ? `${preventivo.visite} volte, l'ultima ` : ""}il {preventivo.vistoIl.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              : <span className="text-neutral-500">non ancora aperta dal cliente</span>}
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100">
            {preventivo.emailInviate.map((e) => (
              <li key={e.id} className="py-1.5">
                <span className={e.stato === "INVIATA" ? "text-green-800" : "text-red-700"}>{e.stato === "INVIATA" ? "✓" : "✗"}</span>{" "}
                {e.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · <b>{e.oggetto}</b> → {e.a}{e.cc ? ` (cc ${e.cc})` : ""}
                {e.inviataDa ? ` · da ${e.inviataDa}` : ""}{e.allegati.length ? ` · 📎 ${e.allegati.join(", ")}` : ""}
                {e.motivo && <span className="text-red-700"> · {e.motivo}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {preventivo.archiviato && (
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold">🗄️ Offerta archiviata</span>
        )}
      </div>

      <AvvisoMisuraFuoriListino errore={errore} />

      {preventivo.brand.nome === "Solaris" && preventivo.solarisProgetto && (
        <div className="mb-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-green-900">☀️ Progetto Solaris Studio collegato</p>
            <p className="text-xs text-green-700 mt-0.5">Importa i componenti (pannelli, inverter, batteria, installazione) come righe nel preventivo.</p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <Link
              href={`/solaris/progetto/${preventivo.solarisProgetto.id}`}
              className="btn-3d btn-3d-outline text-sm px-3 py-1.5"
            >
              ☀️ Apri Studio
            </Link>
            <form action={importaSolarisInPreventivo}>
              <input type="hidden" name="progettoId" value={preventivo.solarisProgetto.id} />
              <button type="submit" className="btn-3d btn-3d-green text-sm px-3 py-1.5">
                ↓ Importa nel preventivo
              </button>
            </form>
          </div>
        </div>
      )}

      {errore && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          ⚠️ {errore}
        </div>
      )}

      <fieldset disabled={bloccata} className={`min-w-0 ${bloccata ? "opacity-75" : ""}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-600 mb-1">Commerciale</p>
          <p className="text-sm font-semibold">👤 {preventivo.commerciale.nome}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-600 mb-1">Stato</p>
          <form action={aggiornaStatoPreventivo} className="flex items-center gap-1">
            <input type="hidden" name="id" value={preventivo.id} />
            <SelectAutoInvio key={preventivo.stato} name="stato" defaultValue={preventivo.stato} opzioni={STATI.map((s) => ({ valore: s, etichetta: NOMI_STATO[s] ?? s }))} className="text-sm border border-neutral-200 rounded px-2 py-1" />
            <span className="text-[11px] text-neutral-500">si salva da solo</span>
          </form>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <form action={aggiornaImmagineOfferta}>
          <input type="hidden" name="id" value={preventivo.id} />
          <SelettoreImmagine
            name="immagineCopertinaUrl"
            defaultValue={preventivo.immagineCopertinaUrl}
            inviaSubito
            label="🖼️ Immagine o render dell'offerta — in stampa va sotto l'intestazione (si salva da sola)"
          />
        </form>
      </div>
      </fieldset>

      {mostraFirma ? (
  <PannelloConferma
        preventivoId={preventivo.id}
        stato={preventivo.stato}
        confermatoIl={preventivo.confermatoIl}
        confermatoDaNome={preventivo.confermatoDaNome}
        nContratto={nContratto}
        nFoto={nFoto}
        commessa={preventivo.commessa ? { id: preventivo.commessa.id, numero: numeroCommessa(preventivo.commessa), prossimo: preventivo.commessa.tasks[0] ?? null } : null}
        amministratore={isAmministratore(utenteCorrente)}
        appenaConfermata={confermata === "1"}
        varianteSalvata={variante === "1"}
      />
      ) : (
        <p className="mb-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
          ✍️ «Il cliente ha firmato?» compare dopo l&apos;invio dell&apos;offerta.{" "}
          <Link href={`/preventivi/${preventivo.id}?firma=1`} className="underline">Ha già firmato su carta? Conferma l&apos;ordine adesso</Link>
        </p>
      )}

      <fieldset disabled={bloccata} className={`min-w-0 ${bloccata ? "opacity-75" : ""}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-bold text-neutral-900">Righe ({preventivo.righe.length})</h2>
        <form action={creaSezione} className="flex items-center gap-1.5">
          <input type="hidden" name="preventivoId" value={preventivo.id} />
          <input name="nome" placeholder="es. Cucina, Camera 1..." className="text-xs border border-neutral-300 rounded px-2 py-1.5 w-44" />
          <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">🏠 + crea sezione</button>
        </form>
      </div>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-6">
        {(() => {
          const renderRiga = (r: (typeof preventivo.righe)[number], idx: number, arr: (typeof preventivo.righe)[number][]) => {
          if (!r.prodotto) {
            const subtotaleLibero = r.quantita * r.prezzoUnitario;
            return (
              <div key={r.id} className="flex items-stretch">
                {controlliSpostamento(r.id, r.sezioneId, idx, arr.length)}
                <div className="flex-1 min-w-0 px-4 py-3 text-sm">
                <RigaTesto rigaId={r.id} preventivoId={preventivo.id} testo={r.testoLibero ?? ""} importo={subtotaleLibero} />
                </div>
              </div>
            );
          }
          const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
          const subtotale = r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
          const prodotto = r.prodotto;
          const modello = modelloMap.get(prodotto.tipologia);
          const unit = unitaMisura(prodotto.tipologia);
          const larghezzaMostrata = r.misuraLarghezza ?? prodotto.larghezzaMm;
          const altezzaMostrata = r.misuraAltezza ?? prodotto.altezzaMm;
          const descrizioneEffettiva = r.descrizionePersonalizzata ?? modello?.descrizioneTecnica ?? "";
          return (
            <div key={r.id} className="flex items-stretch">
              {controlliSpostamento(r.id, r.sezioneId, idx, arr.length)}
              <div className="flex-1 min-w-0 px-4 py-3 text-sm">
              <RigaAzioni
                rigaId={r.id}
                preventivoId={preventivo.id}
                subtotale={subtotale}
                quantita={r.quantita}
                misuraLarghezza={r.misuraLarghezza}
                misuraAltezza={r.misuraAltezza}
                prezzoUnitario={r.prezzoUnitario}
                unit={unit}
              >
                <div className="flex items-center gap-3">
                  {modello?.immagineUrl && (
                    <img src={modello.immagineUrl} alt={prodotto.tipologia} className="w-12 h-12 object-cover rounded border border-neutral-200" />
                  )}
                  <div>
                    <p className="font-medium">
                      {prodotto.tipologia.startsWith("RASOMURO_") || prodotto.tipologia.startsWith("FIDRA_") || prodotto.tipologia.startsWith("OPTIMA_") || prodotto.tipologia.startsWith("PORTAVETRO_") || prodotto.tipologia.startsWith("STABYLA_") || prodotto.tipologia.startsWith("PEDANA_") || prodotto.tipologia.startsWith("PAVGAL_") || prodotto.tipologia.startsWith("LATT_") || prodotto.tipologia.startsWith("TAGLIOFREDDO_") ? labelBreveTipologia(prodotto.tipologia) : prodotto.tipologia}{prodotto.tipologia.startsWith("FIDRA_") ? " · Fidra" : prodotto.tipologia.startsWith("OPTIMA_") || prodotto.tipologia.startsWith("STABYLA_") || prodotto.tipologia.startsWith("PEDANA_") || prodotto.tipologia.startsWith("TAGLIOFREDDO_") ? "" : ` · ${prodotto.colore}`}
                      {prodotto.tipologia.startsWith("TAGLIOFREDDO_") ? (r.misuraLarghezza ? ` · L ${r.misuraLarghezza} × H ${r.misuraAltezza} cm` : null) : haMisura(prodotto.larghezzaMm, prodotto.altezzaMm) && ` · ${larghezzaMostrata}×${altezzaMostrata}${unit}`}
                      {prodotto.tipologia.startsWith("RASOMURO_") && r.misuraLarghezza ? ` · L ${r.misuraLarghezza} × H ${r.misuraAltezza} cm` : null}
                      {prodotto.tipologia.startsWith("LATT_") && r.misuraLarghezza ? ` · pezzi da ${r.misuraLarghezza} cm` : null}
                      {r.misuraLarghezza && haMisura(prodotto.larghezzaMm, prodotto.altezzaMm) && !prodotto.tipologia.startsWith("TAGLIOFREDDO_") && (
                        <span className="text-neutral-600 font-normal"> (fascia listino {prodotto.larghezzaMm}×{prodotto.altezzaMm}{unit})</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-600">{r.quantita} × {r.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
                  </div>
                </div>
              </RigaAzioni>

              {(modello?.descrizioneTecnica || r.descrizionePersonalizzata) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <form action={toggleDescrizioneRiga}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="preventivoId" value={preventivo.id} />
                    <input type="hidden" name="mostra" value={(!r.mostraDescrizione).toString()} />
                    <button className={`text-[11px] px-2 py-0.5 rounded-full border ${r.mostraDescrizione ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-600"}`}>
                      {r.mostraDescrizione ? "✓ foto (e testo personalizzato) in offerta" : "foto e testo nascosti in offerta — clicca per mostrarli"}
                    </button>
                  </form>
                  {r.descrizionePersonalizzata && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                      testo personalizzato per questa riga
                    </span>
                  )}
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-neutral-600 hover:text-neutral-700" title="In stampa c'è il riepilogo a elenco (tipo, colore, misure, optional); la scheda tecnica completa compare solo se la personalizzi qui">✏️ testo per il cliente (facoltativo)</summary>
                    <form action={aggiornaDescrizionePersonalizzata} className="mt-1.5 flex flex-col gap-1.5 max-w-lg">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="preventivoId" value={preventivo.id} />
                      <textarea
                        name="descrizionePersonalizzata"
                        defaultValue={descrizioneEffettiva}
                        rows={3}
                        className="border border-neutral-200 rounded px-2 py-1.5 text-xs w-full"
                      />
                      <div className="flex gap-2">
                        <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva testo per questa riga</button>
                        {r.descrizionePersonalizzata && (
                          <button
                            formAction={aggiornaDescrizionePersonalizzata}
                            name="descrizionePersonalizzata"
                            value=""
                            className="btn-3d btn-3d-outline text-[11px] px-2 py-1"
                          >
                            ripristina descrizione standard
                          </button>
                        )}
                      </div>
                    </form>
                  </details>
                </div>
              )}

              {r.optionali.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-neutral-100 flex flex-col gap-1">
                  {r.optionali.map((ro) => (
                    <div key={ro.id} className="flex items-center justify-between text-xs text-neutral-700">
                      <span>
                        + {ro.optional.categoria.startsWith("Tessuto - ")
                          ? `${ro.optional.categoria.replace("Tessuto - ", "")} ${ro.optional.nome}`
                          : ro.optional.categoria.startsWith("Motore - ") && ro.optional.categoria !== "Motore - Manuale"
                          ? `${ro.optional.categoria.replace("Motore - ", "")} ${ro.optional.nome}`
                          : ro.optional.nome.includes("scrittura libera") || ro.optional.nome.includes("da definire")
                          ? ro.optional.categoria.replace(/^Pannello( Interno - (STD|A pagamento))?$/, (m, _g1, tipo) =>
                              tipo === "STD" ? "Pannello interno STD" : tipo === "A pagamento" ? "Pannello interno a pagamento" : "Pannello esterno"
                            )
                          : ro.optional.nome}
                        {ro.nota ? ` — "${ro.nota}"` : ""} ({ro.quantita}×{ro.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })})
                      </span>
                      <form action={rimuoviOptionalDaRiga}>
                        <input type="hidden" name="id" value={ro.id} />
                        <input type="hidden" name="preventivoId" value={preventivo.id} />
                        <button className="text-red-400 hover:text-red-600">rimuovi</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              <FinestraOptional rigaId={r.id} titolo={labelBreveTipologia(prodotto.tipologia)} scelti={r.optionali.length}>
              {(() => {
                const optionaliRigaFiltrati = optionaliDisponibili
                  .filter((o) => o.listino === null || optionalSeraFrangisoleApplicabile(o.listino, prodotto.tipologia) || o.listino === listinoDiTipologia(prodotto.tipologia) || o.listino === prodotto.tipologia || o.listino === famigliaColoreStruttura(prodotto.tipologia) || listiniRasomuro(prodotto.tipologia).includes(o.listino ?? "") || listiniFidra(prodotto.tipologia).includes(o.listino ?? "") || listiniOptima(prodotto.tipologia).includes(o.listino ?? "") || listiniPavgal(prodotto.tipologia).includes(o.listino ?? ""))
                  /* Porte raso muro, serramenti Fidra e porte a vetro: solo le voci del proprio listino (non quelle Isomax senza listino del gruppo PORTE INTERNE). */
                  .filter((o) => !(prodotto.tipologia.startsWith("RASOMURO_") || prodotto.tipologia.startsWith("FIDRA_") || prodotto.tipologia.startsWith("OPTIMA_") || prodotto.tipologia.startsWith("PORTAVETRO_") || prodotto.tipologia.startsWith("STABYLA_") || prodotto.tipologia.startsWith("PEDANA_") || prodotto.tipologia.startsWith("PAVGAL_") || prodotto.tipologia.startsWith("TAGLIOFREDDO_")) || o.listino !== null || o.gruppiApplicabili.length === 0 || o.categoria.endsWith("(Work&Service)"))
                  .filter((o) => o.gruppiApplicabili.length === 0 || (modello?.gruppo && o.gruppiApplicabili.includes(modello.gruppo)))
                  .filter((o) => !o.finituraApplicabile || o.finituraApplicabile === finituraDiTipologia(prodotto.tipologia))
                  /* Il colore profilo per le zanzariere plissé è già implicito nella scelta della finitura
                     (Standard/Standard Plus/Michelangelo/Finto Legno) fatta a monte: non va riproposto qui. */
                  .filter((o) => !(o.categoria === "Colore" && modello?.gruppo === "ZANZARIERE_PLISSE"))
                  /* Cassonetti PVC da restauro: come optional solo le colorazioni del proprio listino
                     (non le voci generiche dei SERRAMENTI: accessori Zenith, posa e servizi Work&Service). */
                  .filter((o) => listinoDiTipologia(prodotto.tipologia) !== "CASSONETTOPVC" || o.listino === "CASSONETTOPVC");

                // Tende a rullo da interno: tendina "Colore tessuto" con swatch colorato,
                // scoperta al solo tessuto gia' determinato dal prodotto scelto (categoria
                // Optional "Colore - <SLUG>"), separata da eventuali altri optional futuri
                // — vedi task #283/#290. Il tessuto specifico e' quello che fissa il prezzo
                // (griglia larghezza×altezza), il colore no: e' una scelta a valle, gratuita.
                if (modello?.gruppo === "TENDE INTERNE") {
                  const slug = slugTessutoRullo(prodotto.tipologia);
                  const coloriRullo = slug
                    ? optionaliRigaFiltrati.filter((o) => o.categoria === `Colore - ${slug}`)
                    : [];
                  const altriOptionalRullo = optionaliRigaFiltrati.filter((o) => !o.categoria.startsWith("Colore - "));
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {slug && (
                        <SelettoreColoreTessutoRullo
                          optionali={coloriRullo}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                      {altriOptionalRullo.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {altriOptionalRullo.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per le Pensiline: tendina "Colori" (colore struttura) separata da
                // "Optional" (policarbonato, trasporto, imballo) come richiesto.
                if (modello?.gruppo === "PENSILINE") {
                  const coloriPensilina = optionaliRigaFiltrati.filter((o) => o.categoria === "Colore");
                  const optionalPensilina = optionaliRigaFiltrati.filter((o) => o.categoria !== "Colore");
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {coloriPensilina.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {coloriPensilina.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore</button>
                        </form>
                      )}
                      {optionalPensilina.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {optionalPensilina.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per i Blindati: tendina separata "Optional Blindato" (fuori misura, vetro,
                // sopraluce, fianco luce, accessori) da "Pannelli e colori" (le centinaia di
                // varianti di pannello/colore delle collezioni Tradizione/Contemporaneo) — un
                // unico elenco misto sarebbe ingestibile con quasi 1000 voci di pannelli.
                if (modello?.gruppo === "BLINDATI") {
                  // Pannelli interni (categoria "Pannello Interno - ...") separati dai
                  // pannelli esterni (categoria che inizia per "Pannello" ma non
                  // "Pannello Interno") — vedi richiesta utente: due tendine distinte,
                  // esterno con scrittura libera per finiture a sovrapprezzo non a
                  // catalogo, interno con STD/a pagamento + scrittura libera (oggi
                  // segnaposto in attesa del listino reale delle finiture interne).
                  const pannelliEsterni = optionaliRigaFiltrati.filter(
                    (o) => o.categoria.startsWith("Pannello") && !o.categoria.startsWith("Pannello Interno")
                  );
                  const pannelliInterni = optionaliRigaFiltrati.filter((o) => o.categoria.startsWith("Pannello Interno"));
                  // "Fuori Misura" isolato in una sezione propria, evidenziata, separata
                  // dagli altri optional: il selettore misura permette di inserire misure
                  // fuori dal range standard calcolando comunque un prezzo (fascia più
                  // vicina), quindi è facile dimenticarsi di aggiungere a mano la
                  // maggiorazione corretta. Metterla sotto "optional" generico la rendeva
                  // poco visibile al commerciale (vedi richiesta utente).
                  const fuoriMisuraBlindati = optionaliRigaFiltrati.filter((o) => o.categoria === "Fuori Misura");
                  const altriOptionalBlindato = optionaliRigaFiltrati.filter(
                    (o) => !o.categoria.startsWith("Pannello") && o.categoria !== "Fuori Misura"
                  );
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {fuoriMisuraBlindati.length > 0 && (
                        <div className="rounded border border-orange-300 bg-orange-50 px-2 py-1.5 flex flex-col gap-1">
                          <p className="text-[11px] font-semibold text-orange-800">
                            ⚠️ Misura fuori standard? Aggiungi qui la maggiorazione &quot;Fuori Misura&quot;
                            (per ogni anta, nei modelli a due ante) — il prezzo del portoncino sopra
                            NON si aggiorna da solo.
                          </p>
                          <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                            <input type="hidden" name="rigaId" value={r.id} />
                            <input type="hidden" name="preventivoId" value={preventivo.id} />
                            <select name="optionalId" className="text-xs border border-orange-300 rounded px-1.5 py-1 max-w-[220px]">
                              {fuoriMisuraBlindati.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                                </option>
                              ))}
                            </select>
                            <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-orange-300 rounded px-1.5 py-1 w-14" />
                            <button className="btn-3d text-[11px] px-2 py-1 bg-orange-500 text-white">+ fuori misura</button>
                          </form>
                        </div>
                      )}
                      {altriOptionalBlindato.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            <option value="" disabled>
                              Altri costi aggiuntivi (vetro, sopraluce, fianco luce, accessori) —
                            </option>
                            {altriOptionalBlindato.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional blindato</button>
                        </form>
                      )}
                      {pannelliEsterni.length > 0 && (
                        <SelettorePannelliBlindati
                          optionali={pannelliEsterni}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                      {pannelliInterni.length > 0 && (
                        <SelettorePannelliInterniBlindati
                          optionali={pannelliInterni}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                    </div>
                  );
                }

                // Per i Cancelli: tendine separate colori std / colori a pagamento / altri optional,
                // così sono immediatamente distinguibili invece di un unico elenco misto.
                if (modello?.gruppo === "CANCELLI") {
                  const coloriStandard = optionaliRigaFiltrati.filter((o) => o.categoria === "Colore" && o.valore === 0);
                  const coloriPagamento = optionaliRigaFiltrati.filter((o) => o.categoria === "Colore" && o.valore > 0);
                  const altriOptional = optionaliRigaFiltrati.filter((o) => o.categoria !== "Colore");
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {coloriStandard.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {coloriStandard.map((o) => (
                              <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore standard</button>
                        </form>
                      )}
                      {coloriPagamento.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {coloriPagamento.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} (+{o.valore}€{o.unita ? `/${o.unita}` : ""})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore a pagamento</button>
                        </form>
                      )}
                      {altriOptional.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {altriOptional.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ altro optional</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per Isomax (Porte interne): tendina "Colore" separata dal resto degli
                // optional (maggiorazioni spessore muro, taglio, serrature) — i colori
                // disponibili variano gia' per modello grazie al filtro sul listino
                // (ISOMAX_A/B/L applicato sopra), quindi qui basta isolare la categoria
                // "Colore" per renderla immediatamente visibile invece di perderla in
                // mezzo a una quindicina di altre voci.
                // Porte raso muro (MYA, KIUSO, STRIP): una tendina per ogni gruppo di voci del listino
                // (finitura/anta, su misura, telaio, chiusure, maniglie, accessori, lavorazioni, trasporto).
                // Serramenti Fidra: stesso schema (colore, vetri, maniglie, traversi, misure, servizi).
                const fidra = prodotto.tipologia.startsWith("FIDRA_");
                // Serramenti PVC Optima 70: come Fidra.
                const optima = prodotto.tipologia.startsWith("OPTIMA_");
                const portaVetro = prodotto.tipologia.startsWith("PORTAVETRO_");
                const tempra = prodotto.tipologia.startsWith("STABYLA_");
                const pedana = prodotto.tipologia.startsWith("PEDANA_");
                const pavgal = prodotto.tipologia.startsWith("PAVGAL_");
                const tagliofreddo = prodotto.tipologia.startsWith("TAGLIOFREDDO_");
                if (prodotto.tipologia.startsWith("RASOMURO_") || fidra || optima || portaVetro || tempra || pedana || pavgal || tagliofreddo) {
                  const ordine = ["Piedini regolabili", "Pezzi speciali", "Finiture", "Posa e servizi", "Copertura", "Illuminazione LED", "Apertura", "Accessori", "Colore telaio", "Misure", "Colore", "Supplementi", "Smontaggio", "Sconti per quantità", "Vetri", "Maniglie e ferramenta", "Traversi e pannelli", "Misure e lavorazioni", "Servizi al contratto", "Finitura anta", "Anta", "Su misura", "Telaio e varianti", "Chiusure e serrature", "Maniglie e maniglioni", "Fonoisolamento (battenti)", "Planarità ante", "Lavorazioni particolari", "Accessori di ricambio", "Imballo e trasporto"];
                  // le voci Work&Service (posa, rilievo, trasporto, trasferte, magazzino…) stanno tutte in un'unica tendina, divise per tipo
                  const WS = "Posa e servizi (Work&Service)";
                  const gruppoDi = (o: { categoria: string }) => (o.categoria.endsWith("(Work&Service)") ? WS : o.categoria);
                  const categorie = [...new Set(optionaliRigaFiltrati.map(gruppoDi))].sort((a, b) => (ordine.indexOf(a) + 1 || (a === WS ? 98 : 99)) - (ordine.indexOf(b) + 1 || (b === WS ? 98 : 99)));
                  const testoVoce = (o: (typeof optionaliRigaFiltrati)[number]) =>
                    `${o.nome} (${o.tipoPrezzo === "PERCENTUALE" ? `${o.valore > 0 ? "+" : ""}${o.valore}%` : o.valore === 0 ? "compreso" : `${o.valore > 0 ? "+" : ""}${o.valore.toLocaleString("it-IT", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(o.valore) ? 0 : 2 })}€${o.unita ? `/${o.unita}` : ""}`})`;
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      <p className="text-[11px] text-neutral-500">
                        {tagliofreddo ? GUIDA_TAGLIO_FREDDO : pavgal ? GUIDA_PAVGAL : pedana ? GUIDA_PEDANE : tempra ? GUIDA_TEMPRA : portaVetro ? GUIDA_PORTE_VETRO : optima ? GUIDA_OPTIMA : fidra ? GUIDA_FIDRA : guidaRasomuro(prodotto.tipologia)}{" "}
                        {(portaVetro || tempra || pedana || pavgal || tagliofreddo ? [] : optima ? CATALOGHI_OPTIMA : fidra ? CATALOGHI_FIDRA : CATALOGHI_RASOMURO).map((c) => (
                          <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="underline text-blue-700 mr-2">📘 {c.nome}</a>
                        ))}
                      </p>
                      {categorie.map((cat) => {
                        const voci = optionaliRigaFiltrati.filter((o) => gruppoDi(o) === cat).sort((a, b) => Number(a.valore !== 0) - Number(b.valore !== 0)); // le voci comprese (colori standard) per prime
                        const sottogruppi = cat === WS ? [...new Set(voci.map((o) => o.categoria))] : [];
                        return (
                          <form key={cat} action={aggiungiOptionalARiga} className="flex flex-wrap items-center gap-1">
                            <input type="hidden" name="rigaId" value={r.id} />
                            <input type="hidden" name="preventivoId" value={preventivo.id} />
                            <select name="optionalId" aria-label={cat} className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[420px]">
                              {cat === WS
                                ? sottogruppi.map((sg) => (
                                    <optgroup key={sg} label={sg.replace(" (Work&Service)", "")}>
                                      {voci.filter((o) => o.categoria === sg).map((o) => (
                                        <option key={o.id} value={o.id}>{testoVoce(o)}</option>
                                      ))}
                                    </optgroup>
                                  ))
                                : voci.map((o) => (
                                    <option key={o.id} value={o.id}>{testoVoce(o)}</option>
                                  ))}
                            </select>
                            <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                            <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ {cat.toLowerCase()}</button>
                          </form>
                        );
                      })}
                    </div>
                  );
                }

                if (modello?.gruppo === "PORTE INTERNE") {
                  const coloriIsomax = optionaliRigaFiltrati.filter((o) => o.categoria === "Colore");
                  const fuoriMisuraIsomax = optionaliRigaFiltrati.filter((o) => o.categoria === "Maggiorazione taglio/luce netta");
                  const altriOptionalIsomax = optionaliRigaFiltrati.filter(
                    (o) => o.categoria !== "Colore" && o.categoria !== "Maggiorazione taglio/luce netta"
                  );
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      <p className="text-[11px] text-neutral-500">
                        Misure standard di produzione: 70/80cm luce netta (nel prezzo). Riduzione a 60cm o
                        allargamento a 90cm: +38€ (tendina &quot;fuori misura&quot; sotto). Oltre, o tagli in
                        altezza/larghezza/obliquo: vedi stessa tendina.
                      </p>
                      {coloriIsomax.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            {coloriIsomax.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}{o.valore > 0 ? ` (+${o.valore}€)` : " (compreso)"}
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore</button>
                        </form>
                      )}
                      {fuoriMisuraIsomax.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[300px]">
                            {fuoriMisuraIsomax.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}{o.valore > 0 ? ` (+${o.valore}€)` : ""}
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ fuori misura</button>
                        </form>
                      )}
                      {altriOptionalIsomax.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {altriOptionalIsomax.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ altro optional</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per le Persiane (Blindate in acciaio + Orientabili a Goccia in alluminio):
                // troppi accessori diversi (fino a un'ottantina per la Goccia) per stare in
                // un'unica tendina piatta, quindi si separano in 5 gruppi tematici: apertura
                // (battenti/scorrevole/a libro — la scelta piu' importante, sempre in cima),
                // colori, motorizzazione, profili complementari, e un gruppo "servizi e
                // lavorazioni" che raccoglie tutto il resto (maggiorazioni telaio, cardini,
                // accessori vari, lavorazioni, servizi) cosi' da trovare subito quello che
                // serve invece di scorrere decine di voci mischiate.
                if (modello?.gruppo === "PERSIANE") {
                  const aperturaPersiane = optionaliRigaFiltrati.filter((o) => o.categoria === "Ferramenta e apertura");
                  const coloriPersiane = optionaliRigaFiltrati.filter(
                    (o) => o.categoria === "Colore struttura" || o.categoria === "Colore"
                  );
                  const motorizzazionePersiane = optionaliRigaFiltrati.filter((o) => o.categoria.startsWith("Motorizzazione"));
                  const profiliPersiane = optionaliRigaFiltrati.filter((o) => o.categoria === "Profili complementari");
                  // Accessorio separato dal generico "servizi e lavorazioni": cilindri,
                  // maniglie ecc. sono scelte frequenti e vanno trovate subito, non in
                  // mezzo a voci di lavorazione/servizio — vedi richiesta utente.
                  const accessoriPersiane = optionaliRigaFiltrati.filter((o) => o.categoria === "Accessorio");
                  const serviziPersiane = optionaliRigaFiltrati.filter(
                    (o) =>
                      o.categoria !== "Ferramenta e apertura" &&
                      o.categoria !== "Colore struttura" &&
                      o.categoria !== "Colore" &&
                      !o.categoria.startsWith("Motorizzazione") &&
                      o.categoria !== "Profili complementari" &&
                      o.categoria !== "Accessorio"
                  );
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {aperturaPersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Tipo apertura —</option>
                            {aperturaPersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ apertura</button>
                        </form>
                      )}
                      {coloriPersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Colore —</option>
                            {coloriPersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}{o.valore > 0 ? ` (+${o.valore}€)` : " (compreso)"}
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore</button>
                        </form>
                      )}
                      {motorizzazionePersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Motorizzazione —</option>
                            {motorizzazionePersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ motorizzazione</button>
                        </form>
                      )}
                      {profiliPersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Profilo complementare —</option>
                            {profiliPersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ profilo</button>
                        </form>
                      )}
                      {accessoriPersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Accessori —</option>
                            {accessoriPersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ accessorio</button>
                        </form>
                      )}
                      {serviziPersiane.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[280px]">
                            <option value="">Servizi e lavorazioni —</option>
                            {serviziPersiane.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ servizio</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per le Tende da sole (a bracci, a caduta, classiche, orizzontali,
                // veranda, giardino/patio, cappottine, telai fissi): tendina "Tessuto
                // Tempotest" a cascata separata (collezione -> codice, +slot di
                // scrittura libera per correggere il codice esatto) da tutti gli
                // altri optional (colore struttura, motorizzazione, ecc.) — un unico
                // elenco misto sarebbe ingestibile con oltre 500 codici tessuto.
                if (modello?.gruppo && GRUPPI_TENDE_CON_TESSUTO.includes(modello.gruppo)) {
                  const motori = optionaliRigaFiltrati.filter((o) => o.categoria.startsWith("Motore - "));
                  const accessoriMotore = optionaliRigaFiltrati.filter((o) => o.categoria.startsWith("Accessorio motore - "));
                  const coloreTelaio = optionaliRigaFiltrati.filter((o) => o.categoria === "Colore struttura");
                  const tessuti = optionaliRigaFiltrati.filter((o) => o.categoria.startsWith("Tessuto - "));
                  const altriOptionalTenda = optionaliRigaFiltrati.filter(
                    (o) =>
                      !o.categoria.startsWith("Motore - ") &&
                      !o.categoria.startsWith("Accessorio motore - ") &&
                      o.categoria !== "Colore struttura" &&
                      !o.categoria.startsWith("Tessuto - ")
                  );
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {motori.length > 0 && (
                        <SelettoreMotori
                          optionali={motori}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                      {accessoriMotore.length > 0 && (
                        <SelettoreAccessoriMotore
                          optionali={accessoriMotore}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                      {coloreTelaio.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            <option value="">Colore telaio —</option>
                            {coloreTelaio.map((o) => (
                              <option key={o.id} value={o.id}>{o.nome}</option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore telaio</button>
                        </form>
                      )}
                      {tessuti.length > 0 && (
                        <SelettoreTessuti
                          optionali={tessuti}
                          formAction={aggiungiOptionalARiga}
                          rigaId={r.id}
                          preventivoId={preventivo.id}
                        />
                      )}
                      {altriOptionalTenda.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                            {altriOptionalTenda.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional</button>
                        </form>
                      )}
                    </div>
                  );
                }

                // Per le Pergole (Lucilla/Nuvola/Panarea) e le Bioclimatiche
                // (Wawe/Solaria/Raincover/Aurora): nella stessa tendina finivano mischiati
                // optional di natura molto diversa — luci/impianti dal catalogo condiviso
                // Illuminazione & Optionals, voci di posa in opera/rilievo dal listino
                // Work&Service, e i veri accessori del modello (tettuccio, gronda, timpano,
                // motorizzazione, sensori...) — rendendo difficile trovare quello che
                // serve. Si separano in tendine tematiche, stesso pattern usato per le
                // Persiane (vedi sopra). Il blocco "optional prodotto" a sua volta,
                // soprattutto su Lucilla (8 categorie, quasi 190 optional), viene
                // ulteriormente suddiviso in 3 sotto-tendine per natura dell'accessorio:
                // coperture (tettuccio/gronda/timpano), motorizzazione/sensori/comandi,
                // struttura/posa/tessuto.
                // Pavimenti (WPC Novowood): accessori per la posa e rifiniture in tendine tematiche,
                // per trovarli piu' in fretta (sottostruttura, supporti, clip, profili di finitura,
                // lavorazioni/trattamenti, anime/tappi/fissaggi frangisole, pilastri e illuminazione recinzioni).
                if (modello?.gruppo === "PAVIMENTI") {
                  const TENDINE_WPC: { titolo: string; categorie: string[]; bottone: string }[] = [
                    { titolo: "Sottostruttura e supporti —", categorie: ["Sottostruttura", "Supporti e livellamento"], bottone: "+ sottostruttura" },
                    { titolo: "Clip e fissaggi —", categorie: ["Clip e fissaggi"], bottone: "+ fissaggio" },
                    { titolo: "Rifiniture e profili di finitura —", categorie: ["Rifiniture e profili"], bottone: "+ rifinitura" },
                    { titolo: "Anime, tappi e sistemi frangisole —", categorie: ["Anime per frangisole", "Tappi e collante", "Fissaggi e sistemi"], bottone: "+ accessorio" },
                    { titolo: "Pilastri e illuminazione recinzione —", categorie: ["Pilastri e illuminazione"], bottone: "+ pilastro/luce" },
                    { titolo: "Lavorazioni e trattamenti —", categorie: ["Lavorazioni e trattamenti"], bottone: "+ lavorazione" },
                  ];
                  const usate = new Set(TENDINE_WPC.flatMap((t) => t.categorie));
                  const altriWpc = optionaliRigaFiltrati.filter((o) => !usate.has(o.categoria));
                  const tendine = [
                    ...TENDINE_WPC.map((t) => ({ ...t, voci: optionaliRigaFiltrati.filter((o) => t.categorie.includes(o.categoria)) })),
                    { titolo: "Altri optional —", categorie: [], bottone: "+ optional", voci: altriWpc },
                  ].filter((t) => t.voci.length > 0);
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {tendine.map((t) => (
                        <form key={t.titolo} action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[320px]">
                            <option value="">{t.titolo}</option>
                            {t.voci.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore.toLocaleString("it-IT", { minimumFractionDigits: 2 })}€${o.unita ? ` ${o.unita.replace("€", "")}` : ""}`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">{t.bottone}</button>
                        </form>
                      ))}
                    </div>
                  );
                }

                if (modello?.gruppo === "PERGOLE" || modello?.gruppo === "BIOCLIMATICA") {
                  const CATEGORIE_ILLUMINAZIONE = ["ILLUMINAZIONE", "TRASMETTITORE", "PRESA", "RISCALDATORE", "AUDIO"];
                  const CATEGORIE_COPERTURA = ["TETTUCCIO", "GRONDA", "TIMPANO"];
                  const isMotorizzazione = (categoria: string) => {
                    const c = categoria.toUpperCase();
                    return c.includes("MOTOR") || c.includes("SENSOR") || c === "TELECOMANDO";
                  };
                  const illuminazionePergole = optionaliRigaFiltrati.filter((o) => CATEGORIE_ILLUMINAZIONE.includes(o.categoria));
                  const posaPergole = optionaliRigaFiltrati.filter((o) => o.categoria.endsWith("(Work&Service)"));
                  const optionalPergoleBase = optionaliRigaFiltrati.filter(
                    (o) => !CATEGORIE_ILLUMINAZIONE.includes(o.categoria) && !o.categoria.endsWith("(Work&Service)")
                  );
                  const coperturaPergole = optionalPergoleBase.filter((o) => CATEGORIE_COPERTURA.includes(o.categoria));
                  const motorizzazionePergole = optionalPergoleBase.filter(
                    (o) => !CATEGORIE_COPERTURA.includes(o.categoria) && isMotorizzazione(o.categoria)
                  );
                  const strutturaPergole = optionalPergoleBase.filter(
                    (o) => !CATEGORIE_COPERTURA.includes(o.categoria) && !isMotorizzazione(o.categoria)
                  );
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {coperturaPergole.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Tettuccio, gronda e timpano —</option>
                            {coperturaPergole.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ copertura</button>
                        </form>
                      )}
                      {motorizzazionePergole.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Motorizzazione, sensori e comandi —</option>
                            {motorizzazionePergole.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ motorizzazione</button>
                        </form>
                      )}
                      {strutturaPergole.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Struttura, posa e tessuto —</option>
                            {strutturaPergole.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ struttura</button>
                        </form>
                      )}
                      {illuminazionePergole.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]">
                            <option value="">Illuminazione e impianti —</option>
                            {illuminazionePergole.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ luce/impianto</button>
                        </form>
                      )}
                      {posaPergole.length > 0 && (
                        <form action={aggiungiOptionalARiga} className="flex items-center gap-1">
                          <input type="hidden" name="rigaId" value={r.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[280px]">
                            <option value="">Posa in opera / Work&amp;Service —</option>
                            {posaPergole.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.categoria.replace(" (Work&Service)", "")} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                              </option>
                            ))}
                          </select>
                          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ posa/servizio</button>
                        </form>
                      )}
                    </div>
                  );
                }

                return (
                  <form action={aggiungiOptionalARiga} className="mt-2 flex items-center gap-1">
                    <input type="hidden" name="rigaId" value={r.id} />
                    <input type="hidden" name="preventivoId" value={preventivo.id} />
                    <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                      {optionaliRigaFiltrati.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                        </option>
                      ))}
                    </select>
                    <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                    <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional</button>
                  </form>
                );
              })()}
              </FinestraOptional>
              </div>
            </div>
          );
          };

          const righeSenzaSezione = preventivo.righe.filter((r) => !r.sezioneId);
          const sezioniConRighe = preventivo.sezioni.map((sezione) => ({
            sezione,
            righe: preventivo.righe.filter((r) => r.sezioneId === sezione.id),
          }));
          const totaleSenzaSezione = righeSenzaSezione.reduce((s, r) => s + subtotaleRiga(r), 0);

          return (
            <>
              {righeSenzaSezione.length > 0 && sezioniConRighe.length > 0 && (
                <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Senza sezione</p>
                  <span className="text-xs font-bold text-neutral-600">
                    {totaleSenzaSezione.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
              )}
              {righeSenzaSezione.map((r, idx, arr) => renderRiga(r, idx, arr))}
              <AggiungiRiga preventivoId={preventivo.id} sezioneId={null} nomeSezione={sezioniConRighe.length > 0 ? "senza sezione" : undefined} />
              {sezioniConRighe.map(({ sezione, righe }, sIdx, sArr) => {
                const totaleSezione = righe.reduce((s, r) => s + subtotaleRiga(r), 0);
                return (
                  <div key={sezione.id}>
                    <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-t-4 border-indigo-400 bg-indigo-50">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <form action={spostaSezioneSu}>
                            <input type="hidden" name="id" value={sezione.id} />
                            <input type="hidden" name="preventivoId" value={preventivo.id} />
                            <button disabled={sIdx === 0} className="btn-3d btn-3d-outline w-6 h-5 p-0 flex items-center justify-center text-[10px]" title="sposta sezione su">▲</button>
                          </form>
                          <form action={spostaSezioneGiu}>
                            <input type="hidden" name="id" value={sezione.id} />
                            <input type="hidden" name="preventivoId" value={preventivo.id} />
                            <button disabled={sIdx === sArr.length - 1} className="btn-3d btn-3d-outline w-6 h-5 p-0 flex items-center justify-center text-[10px]" title="sposta sezione giù">▼</button>
                          </form>
                        </div>
                        <span className="text-xl">🏠</span>
                        <FormAutoSalva key={`nome-${sezione.id}-${sezione.nome}`} action={rinominaSezione} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={sezione.id} />
                          <input type="hidden" name="preventivoId" value={preventivo.id} />
                          <input
                            name="nome"
                            defaultValue={sezione.nome}
                            className="text-base font-bold text-indigo-900 bg-white/70 border border-indigo-200 rounded px-2 py-1 focus:border-indigo-500 focus:outline-none"
                          />
                        </FormAutoSalva>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="btn-3d bg-white text-indigo-900 border-indigo-300 text-sm px-3 py-1.5 cursor-default">
                          Totale: {totaleSezione.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                        </span>
                        {righe.length === 0 && (
                          <form action={eliminaSezione}>
                            <input type="hidden" name="id" value={sezione.id} />
                            <input type="hidden" name="preventivoId" value={preventivo.id} />
                            <button className="btn-3d btn-3d-red text-[11px] px-2.5 py-1.5">🗑 elimina sezione</button>
                          </form>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-neutral-100 bg-indigo-50/20">
                      {righe.map((r, idx, arr) => renderRiga(r, idx, arr))}
                      {righe.length === 0 && (
                        <p className="px-4 py-3 text-xs text-neutral-500 italic">
                          Stanza vuota: aggiungi qui sotto un prodotto o un testo (o spostane uno con la tendina a sinistra delle righe).
                        </p>
                      )}
                      <AggiungiRiga preventivoId={preventivo.id} sezioneId={sezione.id} nomeSezione={sezione.nome} />
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
        {preventivo.righe.length === 0 && (
          <p className="px-4 py-4 text-sm text-neutral-600">Offerta vuota: scegli «🧩 Prodotto» o «📝 Testo» qui sopra. Per dividere per stanze usa «🏠 + crea sezione».</p>
        )}
      </div>


      <div id="aggiungi-prodotto" className="scroll-mt-4" />
      <SelettoreProdotto
        finestra
        sezioni={preventivo.sezioni.map((x) => ({ id: x.id, nome: x.nome }))}
        sezioneId={sezioneScelta?.id ?? null}
        preventivoId={preventivo.id}
        brandId={preventivo.brandId}
        brandColor={info.primary}
        tassonomia={tassonomia}
        azionePerMisura={aggiungiRigaPreventivoPerMisura}
        azionePerProdotto={aggiungiRigaPreventivo}
      />

      <details className="mb-6">
        <summary className="cursor-pointer text-xs text-neutral-600 hover:text-neutral-700">
          Ricerca avanzata — sfoglia le combinazioni di misura già a listino (prezzo modificabile)
        </summary>
        <div className="mt-3">
          <form className="flex items-end gap-2 mb-4" action={`/preventivi/${preventivo.id}`} method="get">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-neutral-700">Cerca tipologia o colore</label>
              <input name="q" defaultValue={q ?? ""} placeholder="es. FF1, LUCILLA_PARETE..." className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Cerca</button>
          </form>

          {prodottiTrovati.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
              {prodottiTrovati.map((p) => (
                <form
                  key={p.id}
                  action={async (fd: FormData) => { "use server"; await aggiungiRigaPreventivo(fd); }}
                  className="flex items-center justify-between px-4 py-2.5 text-sm gap-2"
                >
                  <input type="hidden" name="preventivoId" value={preventivo.id} />
                  <input type="hidden" name="prodottoId" value={p.id} />
                  {sezioneScelta && <input type="hidden" name="sezioneId" value={sezioneScelta.id} />}
                  <span className="flex-1">
                    {p.tipologia} · {p.colore}
                    {haMisura(p.larghezzaMm, p.altezzaMm) && ` · ${p.larghezzaMm}×${p.altezzaMm}${unitaMisura(p.tipologia)}`}
                  </span>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-14" />
                  <input
                    name="prezzoUnitario"
                    type="number"
                    step="0.01"
                    defaultValue={p.prezzoBase}
                    className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-24"
                  />
                  <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ aggiungi</button>
                </form>
              ))}
            </div>
          )}
          {q && prodottiTrovati.length === 0 && (
            <p className="text-sm text-neutral-600">Nessun prodotto trovato per &quot;{q}&quot; nel brand {preventivo.brand.nome}.</p>
          )}
        </div>
      </details>
      {/* ===== Prezzo, IVA e sconto (richiesta di Rocco): a sinistra i campi, a destra il riepilogo come in stampa ===== */}
      <h2 id="prezzo" className="text-base font-bold text-neutral-900 mt-8 mb-3">💶 Prezzo, IVA e sconto</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
          <FormAutoSalva key={`iva-${preventivo.aliquotaIva}`} action={aggiornaIva} className="space-y-1">
            <input type="hidden" name="id" value={preventivo.id} />
            <label className="block text-xs font-semibold text-neutral-700">IVA</label>
            <div className="flex items-center gap-2">
              <select
                name="aliquotaPreset"
                defaultValue={[22, 10, 14.8].includes(preventivo.aliquotaIva) ? String(preventivo.aliquotaIva) : "ALTRO"}
                className="text-sm border border-neutral-300 rounded px-2 py-1.5"
              >
                <option value="22">22%</option>
                <option value="10">10%</option>
                <option value="14.8">14,8% (agevolata)</option>
                <option value="ALTRO">altra…</option>
              </select>
              <input
                name="aliquotaCustom"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={[22, 10, 14.8].includes(preventivo.aliquotaIva) ? "" : preventivo.aliquotaIva}
                placeholder="% (se «altra»)"
                className="w-32 text-sm border border-neutral-300 rounded px-2 py-1.5"
              />
            </div>
          </FormAutoSalva>
          <FormAutoSalva key={`sconto-${preventivo.scontoPercentuale}`} action={aggiornaSconto} className="space-y-1">
            <input type="hidden" name="id" value={preventivo.id} />
            <label className="block text-xs font-semibold text-neutral-700">Sconto %</label>
            <div className="flex items-center gap-2">
              <input
                name="scontoPercentuale"
                type="number"
                step="0.00001"
                min={0}
                max={100}
                defaultValue={preventivo.scontoPercentuale || ""}
                placeholder="0"
                title="Fino a 5 decimali (es. 12,34567)"
                disabled={preventivo.prezzoManualeAttivo}
                className="w-32 text-sm border border-neutral-300 rounded px-2 py-1.5 disabled:bg-neutral-100"
              />
              <span className="text-xs text-neutral-500">{preventivo.prezzoManualeAttivo ? "non conta: c'è il prezzo manuale" : "fino a 5 decimali per far tornare una cifra tonda"}</span>
            </div>
          </FormAutoSalva>
          <FormAutoSalva key={`manuale-${preventivo.prezzoManualeAttivo}-${preventivo.prezzoManualeTotale}`} action={aggiornaPrezzoManuale} className="space-y-1 border-t border-neutral-100 pt-3">
            <input type="hidden" name="id" value={preventivo.id} />
            <label className="block text-xs font-semibold text-neutral-700">💰 Prezzo manuale (totale finale IVA inclusa)</label>
            <input
              name="prezzoManualeTotale"
              type="number"
              step="0.01"
              min={0}
              defaultValue={preventivo.prezzoManualeAttivo ? preventivo.prezzoManualeTotale ?? "" : ""}
              placeholder="vuoto = calcolato dalle righe"
              className="w-48 text-sm border border-neutral-300 rounded px-2 py-1.5"
            />
            <p className="text-[11px] text-neutral-500">
              Se lo scrivi, l&apos;offerta diventa «a corpo»: in stampa niente sconto e niente prezzi delle singole righe, solo il prezzo finale.
              Cancellalo per tornare al calcolo dalle righe.
            </p>
          </FormAutoSalva>
          <p className="text-[11px] text-neutral-400">Si salva tutto da solo: le tendine subito, i numeri quando esci dal campo.</p>
        </div>

        <div className="rounded-xl border overflow-hidden self-start" style={{ borderColor: `${info.primary}33` }}>
          <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: info.primary, background: info.primarySoft }}>Come lo vede il cliente</p>
          <div className="p-4 text-sm space-y-1" style={{ background: info.primarySoft }}>
            {preventivo.prezzoManualeAttivo ? (
              <p className="text-xs text-neutral-600 pb-1">Prezzo a corpo: righe senza prezzi.</p>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-neutral-700">Totale prodotti</span><span>{eur(imponibileLordo)}</span></div>
                {preventivo.scontoPercentuale > 0 && (
                  <div className="flex justify-between text-red-700"><span>− Sconto {percentuale(preventivo.scontoPercentuale)}%</span><span>−{eur(imponibileLordo - preventivo.totaleNetto)}</span></div>
                )}
              </>
            )}
            <div className="flex justify-between"><span className="text-neutral-700">Imponibile</span><span>{eur(preventivo.totaleNetto)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-700">+ IVA {preventivo.aliquotaIva}%</span><span>{eur(preventivo.totaleIva)}</span></div>
          </div>
          <div className="flex justify-between px-4 py-3 font-bold text-white text-base" style={{ background: info.primary }}>
            <span>Totale a pagare</span><span>{eur(totaleFinale)}</span>
          </div>
          <div className="px-4 py-2 bg-white text-xs">
            <p className="font-semibold" style={{ color: info.primary }}>{NOTA_FATTIBILITA}</p>
            <p className="text-[10px] text-neutral-500">{CLAUSOLA_ISTRUTTORIA}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <p className="text-base font-bold text-neutral-900 mb-2">📅 Validità dell&apos;offerta</p>
        <FormAutoSalva key={`scad-${preventivo.scadenza?.toISOString() ?? ""}`} action={aggiornaScadenzaPreventivo} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={preventivo.id} />
          <label className="text-xs font-semibold text-neutral-700">Valida fino al</label>
          <input
            type="date"
            name="scadenza"
            defaultValue={preventivo.scadenza ? preventivo.scadenza.toISOString().slice(0, 10) : ""}
            className="border border-neutral-300 rounded px-2 py-1 text-sm"
          />
          <span className="text-xs text-neutral-600">si salva da sola · di default 15 giorni dalla creazione; scaduta, l&apos;offerta aperta va in archivio</span>
        </FormAutoSalva>
        <p className="mt-1 text-[11px] text-neutral-500">In stampa compare «Offerta valida fino al …».</p>
      </div>
      <div className="bg-white rounded-lg border border-neutral-200 mb-6">
        <p className="text-base font-bold text-neutral-900 px-4 pt-3 pb-2">
          📝 Condizioni dell&apos;offerta <span className="text-xs font-normal text-neutral-500">— usate nella stampa, si salvano da sole quando esci dal campo</span>
        </p>
        <FormAutoSalva key={`cond-${preventivo.oggetto ?? ""}|${preventivo.condizioniPagamento ?? ""}|${preventivo.condizioniConsegna ?? ""}`} action={aggiornaCondizioniOfferta} className="px-4 pb-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={preventivo.id} />
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Oggetto offerta</label>
            <input
              name="oggetto"
              defaultValue={preventivo.oggetto ?? ""}
              placeholder="es. Zanzariere plissettate bilaterali"
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Condizioni di pagamento</label>
            <textarea
              name="condizioniPagamento"
              rows={2}
              defaultValue={preventivo.condizioniPagamento ?? CONDIZIONI_PAGAMENTO_DEFAULT}
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Condizioni di consegna</label>
            <textarea
              name="condizioniConsegna"
              rows={2}
              defaultValue={preventivo.condizioniConsegna ?? CONDIZIONI_CONSEGNA_DEFAULT}
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
        </FormAutoSalva>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <Link href={`/preventivi/${preventivo.id}/stampa?da=offerta`} className="btn-3d btn-3d-blue px-5 py-2 text-sm">👁️ Guarda anteprima</Link>
        <Link href={`/preventivi/${preventivo.id}/invia`} className="btn-3d btn-3d-green px-5 py-2 text-sm">✉️ Invia al cliente</Link>
        <span className="text-xs text-neutral-600">L&apos;anteprima è l&apos;offerta come la vede il cliente: da lì la stampi, la salvi in PDF o la mandi al cliente.</span>
      </div>
      </fieldset>
      {(() => {
        // schede tecniche dei prodotti dell'offerta: spunta = stampate in fondo all'offerta e allegate all'email (anche a offerta confermata)
        const schede = schedeDelleTipologie(preventivo.righe.map((r) => r.prodotto?.tipologia));
        if (!schede.length) return null;
        return (
          <div id="schede-tecniche" className="mb-8 rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm font-bold text-neutral-900 mb-1">📄 Schede tecniche</p>
            <p className="text-xs text-neutral-600 mb-2">Spunta quelle da allegare: si stampano in fondo all&apos;offerta e partono come PDF con l&apos;email al cliente.</p>
            <FormAutoSalva key={`schede-${preventivo.schedeAllegate.join(",")}`} action={aggiornaSchedeAllegate} className="flex flex-col gap-1.5">
              <input type="hidden" name="id" value={preventivo.id} />
              {schede.map((s) => (
                <div key={s.chiave} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="scheda" value={s.chiave} defaultChecked={preventivo.schedeAllegate.includes(s.chiave)} className="h-4 w-4" />
                    Allega «{s.nome}» alla stampa
                  </label>
                  <a href={s.pdf} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">apri la scheda</a>
                </div>
              ))}
            </FormAutoSalva>
          </div>
        );
      })()}
      <div id="documenti-offerta">
        <Documenti entita="PREVENTIVO" entitaId={preventivo.id} titolo="Documenti dell’offerta (contratto firmato, foto, rilievi…)" />
      </div>
    </div>
  );
}
