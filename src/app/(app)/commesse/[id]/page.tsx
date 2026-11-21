export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { costiMaterialeCommesse } from "@/lib/ordini/server";
import CaricaRilievo from "@/components/commesse/CaricaRilievo";
import { verbaleDiPartenza } from "@/lib/rilievo/verbale";
import ModuloScheda from "@/components/ordini/ModuloScheda";
import { creaSchedaDaRilievo, salvaLegnoInPratica, salvaAngolariInPratica } from "@/app/schede-produzione-actions";
import { assicuraModelliPronti } from "@/lib/ordini/schede-server";
import { assicuraArticoliLegno } from "@/lib/ordini/legno-server";
import { valoriAngolari } from "@/lib/ordini/angolari";
import { labelBreveTipologia } from "@/lib/prodotti";
import { notFound } from "next/navigation";
import StatoAcquisti from "@/components/ordini/StatoAcquisti";
import MaterialeCommessa from "@/components/magazzino/MaterialeCommessa";
import Documenti from "@/components/documenti/Documenti";
import { soloAttivi } from "@/lib/utenti/stato";
import { puoGestireOrdini, puoModuloRilievo, EMAIL_ORDINI } from "@/lib/ordini/server";
import { creaOrdineDaRighe, impostaFornitoreRiga } from "@/app/ordini-actions";
import FornitoreRiga from "@/components/commesse/FornitoreRiga";
import { creaProgetto, confermaMaterialeProgetto, aggiungiCorrelato, salvaConsegnaPrevista, complementoDaListino, complementoDaListinoPerMisura, spostaRigheProgetto, taskDaRighe, eliminaRigheMateriale } from "@/app/commesse-actions";
import BarraAzioniMateriale from "@/components/commesse/BarraAzioniMateriale";
import FotoProgetto from "@/components/commesse/FotoProgetto";
import PercorsoProgetto from "@/components/commesse/PercorsoProgetto";
import { percorsoDiCommessa } from "@/lib/progetti/percorso-server";
import SelettoreProdotto from "@/components/SelettoreProdotto";
import { tassonomiaListino } from "@/lib/listini/tassonomia";
import { labelCalcolo } from "@/lib/listini/kit";
import { UFFICI, nomeUfficio } from "@/lib/flusso";
import { passiDiCommessa } from "@/lib/pratica/passi-server";
import { passoDaMostrare, passoPrecedente, type ChiavePasso } from "@/lib/pratica/passi";
import { BarraPassi, TestataPasso } from "@/components/commesse/PercorsoPratica";
import PannelloApertura from "@/components/commesse/PannelloApertura";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import {
  aggiornaCondizioniAcconto,
  registraIncassoAcconto,
  annullaIncassoAcconto,
  aggiornaFinanziamento,
  programmaRilievo,
  registraFatturaAcconto,
  registraBenvenuto,
  annullaRilievo,
  aggiungiNotaCommessa,
  generaFasiStandard,
  aggiungiFase,
  assegnaFase,
  chiudiFase,
  riapriFase,
  generaRigheOrdine,
  aggiornaRigaOrdine,
  aggiungiCostoManuale,
  eliminaComplemento,
  eliminaCostoManuale,
  programmaPosa,
  annullaPosa,
  avviaPosa,
  caricaFotoPosa,
  completaPosa,
  registraSaldo,
  annullaSaldo,
  confermaGiornoPosa,
  chiudiCommessa,
  riapriCommessa,
  segnaRecensioneRichiesta,
  creaAssistenza,
} from "@/app/commesse-actions";
import { STATI_COMMESSA, numeroCommessa, eur, statoConsegna } from "@/lib/commesse";
import TaskCard from "@/components/TaskCard";
import { creaTaskManuale, avviaFlussoCommessa } from "@/app/flusso-actions";
import FotoRilievo from "@/components/FotoRilievo";
import FirmaCliente from "@/components/FirmaCliente";
import KitCliente from "@/components/commesse/KitCliente";
import ApriDaAncora from "@/components/ApriDaAncora";
import CaricaDocumenti from "@/components/documenti/CaricaDocumenti";
import { documentiDi } from "@/lib/documenti/server";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default async function CommessaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ avviso?: string; fatto?: string; avvisoRilievo?: string; fattoMateriale?: string; kitOk?: string; kitErrore?: string; pok?: string; pav?: string; passo?: string; scheda?: string; okScheda?: string; erroreScheda?: string; carica?: string; salvato?: string }> }) {
  const { id } = await params;
  const { avviso, fatto, avvisoRilievo, fattoMateriale, kitOk, kitErrore, pok, pav, passo, scheda, okScheda, erroreScheda, carica, salvato } = await searchParams;
  const utente = await getCurrentUser();
  const c = await prisma.commessa.findUnique({
    where: { id },
    include: {
      cliente: true,
      brand: true,
      preventivo: true,
      responsabile: true,
      rilievi: { include: { tecnico: true, allegati: { select: { id: true, nome: true } } }, orderBy: { dataOra: "desc" } },
      eventi: { orderBy: { createdAt: "desc" } },
      fasi: { orderBy: { ordine: "asc" } },
      tasks: { orderBy: { createdAt: "desc" } },
      righeOrdine: { orderBy: { createdAt: "asc" }, include: { ordineFornitore: { select: { id: true, numero: true, anno: true, stato: true } } } },
      costiManuali: { orderBy: { data: "asc" } },
      assistenze: { orderBy: { createdAt: "desc" } },
      pose: { include: { foto: { select: { id: true, nome: true, categoria: true }, orderBy: { createdAt: "asc" } } }, orderBy: { dataInizio: "desc" } },
    },
  });
  if (!c) notFound();
  const righeOfferta = c.righeOrdine.length ? [] : await prisma.rigaPreventivo.findMany({ where: { preventivoId: c.preventivoId }, include: { prodotto: { select: { tipologia: true, colore: true } } }, orderBy: [{ ordine: "asc" }, { id: "asc" }] });
  const [tecnici, fornitori, soggettiOperativi] = await Promise.all([
    prisma.utente.findMany({ orderBy: { nome: "asc" } }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" } }),
    prisma.soggetto.findMany({ where: { attivo: true, OR: [{ ruoli: { has: "POSATORE_ESTERNO" } }, { ruoli: { has: "TECNICO_INTERNO" } }] }, orderBy: { ragioneSociale: "asc" } }),
  ]);
  const nContratto = await prisma.documento.count({
    where: { cartella: "Contratto firmato", OR: [{ entita: "COMMESSA", entitaId: c.id }, { entita: "PREVENTIVO", entitaId: c.preventivoId }] },
  });
  const righePrev = await prisma.rigaPreventivo.findMany({ where: { preventivoId: c.preventivoId }, include: { optionali: true } });
  const venditaRiga = (rid?: string | null) => {
    const r = righePrev.find((x) => x.id === rid);
    return r ? (r.prezzoUnitario + r.optionalPrezzo) * r.quantita : null;
  };
  const costoOrarioUtente = (uid?: string | null) =>
    soggettiOperativi.find((x) => x.utenteId && x.utenteId === uid)?.costoOrario ?? "";

  // Scheda costi a scalare: movimenti in ordine cronologico con residuo progressivo
  const haAcquistiTotali = c.costiManuali.some((m) => m.categoria === "ACQUISTO_MATERIALE");
  const totaleAcquisti = c.costiManuali.filter((m) => m.categoria === "ACQUISTO_MATERIALE").reduce((t, m) => t + m.importo, 0);
  const fornitoriLista = fornitori.map((f) => ({ id: f.id, ragioneSociale: f.ragioneSociale }));
  // modulo del fornitore al «Carica rilievo» (Ugo 20/11/2026): modelli, legno e angolari già nel materiale, schede già salvate
  const mostraModulo = puoModuloRilievo(utente, c.rilievi.map((x) => x.tecnicoId)) && c.rilievi.some((x) => x.stato !== "ANNULLATO");
  const fornitoriModulo = [...new Map([
    ...c.righeOrdine.filter((r) => r.fornitoreId && !r.ordineFornitoreId && !r.codice?.startsWith("LEGNO-") && !r.codice?.startsWith("ANGALL-")).map((r) => [r.fornitoreId!, r.fornitoreNome ?? "Fornitore"] as const),
  ]).entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  let moduloDati: { modelli: { id: string; nome: string; html: string; fornitore: string | null; fornitoreId: string | null }[]; legniPratica: { codice: string | null; quantita: number }[]; salvate: { id: string; nome: string; createdAt: Date; caricatoDaNome: string | null }[] } | null = null;
  if (mostraModulo) {
    await assicuraModelliPronti();
    await assicuraArticoliLegno();
    const [modelli, legniPratica, salvate] = await Promise.all([
      prisma.schedaProduzioneModello.findMany({ where: { attivo: true }, include: { fornitore: { select: { ragioneSociale: true } } }, orderBy: { nome: "asc" } }),
      prisma.rigaOrdine.findMany({ where: { commessaId: c.id, ordineFornitoreId: null, OR: [{ codice: { startsWith: "LEGNO-" } }, { codice: { startsWith: "ANGALL-" } }] }, select: { codice: true, quantita: true } }),
      prisma.documento.findMany({ where: { entita: "COMMESSA", entitaId: c.id, cartella: "Schede produzione" }, select: { id: true, nome: true, createdAt: true, caricatoDaNome: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    moduloDati = { modelli: modelli.map((m) => ({ id: m.id, nome: m.nome, html: m.html, fornitore: m.fornitore?.ragioneSociale ?? null, fornitoreId: m.fornitoreId })), legniPratica, salvate };
  }
  const consegna = statoConsegna(c.consegnaPrevista, c.stato);
  const [tassonomia, progettiCliente] = await Promise.all([
    tassonomiaListino(c.brandId),
    prisma.commessa.findMany({ where: { clienteId: c.clienteId, id: { not: c.id }, stato: { notIn: ["CHIUSA", "ANNULLATA"] } }, include: { preventivo: { select: { oggetto: true } }, brand: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }] }),
  ]);
  const altriProgetti = progettiCliente.map((p) => ({ id: p.id, nome: `${numeroCommessa(p)} · ${p.brand.nome}${p.preventivo.oggetto ? ` · ${p.preventivo.oggetto}` : ""}`.slice(0, 70) }));
  // nel rilievo: il materiale già nella pratica, o (prima del rilievo) le righe dell'offerta del commerciale
  const materialeOfferta = c.righeOrdine.length
    ? c.righeOrdine.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, complemento: r.complemento, fornitore: r.fornitoreNome }))
    : righeOfferta.map((r) => ({ descrizione: r.testoLibero ?? (r.prodotto ? `${labelBreveTipologia(r.prodotto.tipologia) || r.prodotto.tipologia.replace(/_/g, " ")}${r.prodotto.colore ? ` — ${r.prodotto.colore}` : ""}${r.misuraLarghezza && r.misuraAltezza ? ` (${r.misuraLarghezza}×${r.misuraAltezza})` : ""}` : "Riga"), quantita: r.quantita, complemento: false, fornitore: null }));
  // distinta base: correlati facoltativi ancora da proporre
  const conProdotto = c.righeOrdine.filter((r) => r.prodottoId && !r.kitDiId);
  const prodottiRighe = conProdotto.length ? await prisma.prodotto.findMany({ where: { id: { in: conProdotto.map((r) => r.prodottoId!) } }, select: { id: true, brandId: true, tipologia: true } }) : [];
  const facoltativi = prodottiRighe.length ? await prisma.componenteKit.findMany({ where: { facoltativo: true, OR: prodottiRighe.map((p) => ({ brandId: p.brandId, tipologia: p.tipologia })) }, orderBy: { ordine: "asc" } }) : [];
  const correlatiSuggeriti = conProdotto.flatMap((r) => {
    const p = prodottiRighe.find((x) => x.id === r.prodottoId);
    return facoltativi.filter((k) => p && k.brandId === p.brandId && k.tipologia === p.tipologia)
      .filter((k) => !c.righeOrdine.some((x) => x.kitDiId === r.id && x.descrizione === k.descrizione))
      .map((k) => ({ rigaId: r.id, componenteId: k.id, descrizione: k.descrizione, madre: r.descrizione, come: `${String(k.quantita).replace(".", ",")} ${labelCalcolo(k.calcolo)}` }));
  });
  const nomeRiga = new Map(c.righeOrdine.map((r) => [r.id, r.descrizione]));
  // materiale della pratica, raggruppato per fornitore (così si spuntano insieme le righe dello stesso fornitore)
  // (i pezzi del kit stanno subito sotto il loro prodotto)
  const radici = c.righeOrdine.filter((r) => !r.kitDiId || !nomeRiga.has(r.kitDiId)).sort((a, b) => (a.fornitoreNome ?? "~").localeCompare(b.fornitoreNome ?? "~"));
  const materialeTutto = radici.flatMap((r) => [r, ...c.righeOrdine.filter((k) => k.kitDiId === r.id)]);
  // ordine già inviato (o riga segnata ordinata / dal magazzino): esce da «da ordinare» e non si modifica più
  const giaOrdinata = (r: (typeof materialeTutto)[number]) => r.daMagazzino || r.ordinato || (!!r.ordineFornitore && r.ordineFornitore.stato !== "BOZZA" && r.ordineFornitore.stato !== "ANNULLATO");
  const materialePratica = materialeTutto.filter((r) => !giaOrdinata(r));
  const materialeOrdinato = materialeTutto.filter(giaOrdinata);
  // materiale: righe con costo reale, totali confermati dal fornitore (finché non arriva la fattura), modo rapido
  const materiale = (await costiMaterialeCommesse([c.id])).get(c.id) ?? { voci: [], righeSenzaCosto: 0 };
  type Mov = { data: Date; voce: string; tipo: string; importo: number };
  const movimenti: Mov[] = [
    ...c.fasi.filter((f) => f.stato === "CHIUSA" && f.costoTotale > 0).map((f) => ({ data: f.chiusaIl ?? f.createdAt, voce: `Fase: ${f.nome}${f.assegnatoNome ? " (" + f.assegnatoNome + ")" : ""}`, tipo: "Manodopera", importo: f.costoTotale })),
    ...materiale.voci,
    ...c.costiManuali.map((m) => ({ data: m.data, voce: m.descrizione, tipo: m.categoria === "ALTRO" ? "Altro" : m.categoria === "ACQUISTO_MATERIALE" ? "Materiale (totale)" : m.categoria === "FATTURA_FORNITORE" ? "Fattura fornitore" : m.categoria, importo: m.importo })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());
  const totaleCosti = movimenti.reduce((t, m) => t + m.importo, 0);
  const margine = c.totaleImponibile - totaleCosti;
  const marginePerc = c.totaleImponibile > 0 ? (margine / c.totaleImponibile) * 100 : 0;
  const righeSenzaCosto = materiale.righeSenzaCosto;
  const fasiAperte = c.fasi.filter((f) => f.stato !== "CHIUSA").length;
  let residuo = c.totaleImponibile;
  const admin = isAmministratore(utente);
  const gestoreIncassi = admin || utente?.ruolo === "AMMINISTRATIVO";
  const stato = STATI_COMMESSA[c.stato] ?? { label: c.stato, cls: "bg-neutral-200" };
  const finanz = c.accontoTipo === "FINANZIAMENTO";
  const viaLibera = finanz ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  const percorsoProg = await percorsoDiCommessa(c.id);
  // percorso a passi: si vede solo il passo in corso (o uno già fatto che si rivede); i passi dopo non si aprono finché il corrente non è salvato
  const pp = await passiDiCommessa(c.id);
  // cartella «Rilievi misura» della pratica: si vede e si riempie anche dal riquadro del rilievo
  const fileRilievi = (await documentiDi("COMMESSA", c.id)).filter((d) => d.cartella === "Rilievi misura");
  const sel: ChiavePasso | null = pp ? passoDaMostrare(pp.passi, pp.corrente, passo) : null;
  const apre = (...k: ChiavePasso[]) => sel !== null && k.includes(sel);
  const mostra = (...k: ChiavePasso[]) => !pp || (sel !== null && k.includes(sel));
  const passoSel = pp?.passi.find((x) => x.chiave === sel) ?? null;
  const passoCorr = pp?.passi.find((x) => x.chiave === pp.corrente) ?? null;
  const defaultData = new Date(Date.now() + 86400000).toISOString().slice(0, 16);

  const moduloFornitoreJsx = moduloDati ? (() => {
            const modello = moduloDati.modelli.find((m) => m.id === scheda) ?? null;
            const ap = valoriAngolari([], moduloDati.legniPratica);
            return (
              <section id="modulo-fornitore" className="mt-3 rounded-lg border border-purple-200 bg-purple-50/30 p-3 scroll-mt-4">
                <h3 className="font-bold text-sm mb-1">📐 Modulo del fornitore (misure per la produzione) — si compila qui, al rilievo</h3>
                <p className="mb-2 text-xs text-neutral-600">Scegli il modulo del fornitore (es. NEW LIPARI, SEEGLASS, legno, angolari), scrivi le misure e aggiungi i prodotti: il modulo resta nei documenti della pratica e, quando fai l&apos;ordine a quel fornitore, è già pronto da allegare.</p>
                {okScheda && <p className="mb-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {okScheda}</p>}
                {erroreScheda && <p className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{erroreScheda}</p>}
                <form method="get" className="mb-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="passo" value="RILIEVO" />
                  <label className="text-xs font-semibold">Modulo
                    <select name="scheda" defaultValue={modello?.id ?? ""} className="block rounded border border-neutral-300 px-2 py-1 text-sm">
                      <option value="">Scegli…</option>
                      {moduloDati.modelli.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.fornitore ? ` — ${m.fornitore}` : ""}</option>)}
                    </select>
                  </label>
                  <button className="btn-3d btn-3d-outline text-sm px-3 py-1.5">Apri</button>
                </form>
                {modello && (
                  <ModuloScheda azione={creaSchedaDaRilievo} nascosti={[{ name: "commessaId", value: c.id }]} modello={modello} fornitori={modello.fornitoreId && !fornitoriModulo.some((f) => f.id === modello.fornitoreId) ? [...fornitoriModulo, { id: modello.fornitoreId, nome: modello.fornitore ?? "Fornitore" }] : fornitoriModulo} fornitoreIniziale={modello.fornitoreId ?? (fornitoriModulo.length === 1 ? fornitoriModulo[0].id : undefined)} righeLegno={moduloDati.legniPratica}
                    angolariIniziali={{ iniziali: ap.valori, proposta: ap.proposta }} salvaLegno={salvaLegnoInPratica} salvaAngolari={salvaAngolariInPratica} modificabile dove="nella pratica"
                    testoPulsante="📄 Salva il modulo" nota="Il CRM aggiunge da solo cliente, pratica, materiale e le misure del rilievo. Legno e angolari con «Salva» entrano anche nel materiale da ordinare." />
                )}
                {moduloDati.salvate.length > 0 && (
                  <ul className="mt-3 divide-y divide-neutral-100 text-sm">
                    {moduloDati.salvate.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-3 py-1"><a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-blue-800 underline">📄 {d.nome}</a><span className="text-xs text-neutral-500">{d.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}{d.caricatoDaNome ? ` · ${d.caricatoDaNome}` : ""}</span></li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })() : null;
  // «Carica rilievo»: una schermata sola, a passi (prodotti → verbale → misure e file → salva), senza il resto della pratica
  const caricaId = carica ?? ((scheda || okScheda || erroreScheda) ? [...c.rilievi].filter((x) => x.stato !== "ANNULLATO").sort((x, y) => y.dataOra.getTime() - x.dataOra.getTime())[0]?.id : undefined);
  const rilievoAperto = caricaId ? c.rilievi.find((x) => x.id === caricaId && x.stato !== "ANNULLATO") : undefined;
  if (rilievoAperto) {
    const verbaleIniziale = verbaleDiPartenza(rilievoAperto.verbale, materialeOfferta);
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
        <Link href={`/commesse/${c.id}?passo=RILIEVO#rilievo`} className="btn-indietro">← Torna alla pratica</Link>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">📋 Carica il rilievo</h1>
          <p className="text-sm text-neutral-700"><b>{c.cliente.nome}</b> · pratica {numeroCommessa(c)} · {rilievoAperto.dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })} · {rilievoAperto.tecnico.nome}</p>
          {rilievoAperto.indirizzo && <p className="text-xs text-neutral-600">📍 {rilievoAperto.indirizzo}</p>}
        </div>
        {fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {fatto}</p>}
        {avvisoRilievo && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{avvisoRilievo}</p>}
        {salvato === "1" && (
          <div className="rounded-lg border-2 border-green-400 bg-green-50 p-3">
            <p className="mb-2 text-sm font-bold text-green-900">Rilievo salvato. E adesso?</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/commesse/${c.id}/rilievo/${rilievoAperto.id}/stampa`} className="btn-3d btn-3d-blue text-sm px-4 py-2.5">🖨️ Stampa verbale e rilievo</Link>
              <a href="#modulo-fornitore" className="btn-3d btn-3d-purple text-sm px-4 py-2.5">📐 Modulo del fornitore (se serve)</a>
              <Link href={`/commesse/${c.id}?passo=RILIEVO#rilievo`} className="btn-3d btn-3d-outline text-sm px-4 py-2.5">Torna alla pratica</Link>
            </div>
          </div>
        )}
        <CaricaRilievo brandId={c.brandId} rilievoId={rilievoAperto.id} misure={rilievoAperto.misure ?? ""} eseguito={rilievoAperto.stato === "ESEGUITO"} materialeOfferta={materialeOfferta} fornitori={fornitoriLista} verbale={verbaleIniziale} salvato={salvato === "1"} />
        {moduloFornitoreJsx && (
          <details open={!!(scheda || okScheda || erroreScheda || salvato === "1")} className="rounded-lg border border-neutral-200 bg-white p-2">
            <summary className="cursor-pointer text-sm font-bold text-purple-900">📐 Modulo del fornitore (facoltativo: legno, angolari, pergole, vetrate…)</summary>
            {moduloFornitoreJsx}
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <Link href="/commesse" className="btn-indietro">← Commesse</Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">
          {numeroCommessa(c)} ·{" "}
          <Link href={`/clienti/${c.clienteId}`} title="Apri la scheda del cliente" className="text-blue-800 underline decoration-blue-300 underline-offset-4 hover:decoration-blue-700">
            {c.cliente.nome}
          </Link>
        </h1>
        <span className={`text-xs font-bold px-3 py-1 rounded ${stato.cls}`}>{stato.label}</span>
      </div>
      <div className="mb-3 -mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-700">
        <span>📁 Progetto <b>{c.brand.nome}</b>{c.preventivo.oggetto ? ` · ${c.preventivo.oggetto}` : ""} · <Link href={`/preventivi/${c.preventivoId}`} className="text-blue-800 underline">offerta {c.preventivo.numeroOfferta ?? ""}</Link></span>
        <form action={salvaConsegnaPrevista} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={c.id} />
          <label className="text-xs font-bold text-neutral-800">Consegna prevista</label>
          <input type="date" name="consegnaPrevista" defaultValue={c.consegnaPrevista ? c.consegnaPrevista.toISOString().slice(0, 10) : ""} className={`${inp} py-0.5`} />
          <button className="btn-3d btn-3d-dark text-[11px] px-2 py-1">salva</button>
          {c.consegnaPrevista && <span className={`text-xs ${consegna.cls}`}>{consegna.testo.includes("scaduta") ? "⚠ scaduta" : ""}</span>}
        </form>
      </div>
      {pp && <BarraPassi commessaId={c.id} passi={pp.passi} mostrato={sel} corrente={pp.corrente} />}

      {/* CONTRATTO E CONFERMA ORDINE */}
      <div className={`mb-4 rounded-xl border-2 px-4 py-3 flex flex-wrap items-center gap-3 ${c.preventivo.confermatoIl ? "border-green-300 bg-green-50" : "border-amber-400 bg-amber-50"}`}>
        {c.preventivo.confermatoIl ? (
          <p className="text-sm text-green-900 flex-1">
            🔒 <strong>Ordine confermato</strong> il {c.preventivo.confermatoIl.toLocaleDateString("it-IT")}{c.preventivo.confermatoDaNome ? ` da ${c.preventivo.confermatoDaNome}` : ""}.
            {nContratto > 0 ? ` Contratto firmato: ${nContratto} file.` : " Contratto firmato non ancora caricato."}
          </p>
        ) : (
          <p className="text-sm text-amber-900 flex-1">
            <strong>⚠ Ordine non ancora confermato.</strong> Carica il contratto firmato e conferma l&apos;ordine dall&apos;offerta: la contabilità riceve il task della fattura d&apos;acconto.
          </p>
        )}
        <a href="#documenti" className="btn-3d btn-3d-blue text-sm px-4 py-2">📎 Carica contratto firmato</a>
        {!c.preventivo.confermatoIl && (
          <Link href={`/preventivi/${c.preventivoId}#conferma`} className="btn-3d btn-3d-green text-sm px-4 py-2">🔒 Vai alla conferma ordine</Link>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Brand</p>
          <p className="text-sm font-medium">{c.brand.nome}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Responsabile</p>
          <p className="text-sm font-medium">{c.responsabile?.nome ?? "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Totale vendita (IVA incl.)</p>
          <p className="text-sm font-bold">{eur(c.totaleVendita)}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Preventivo</p>
          <Link href={`/preventivi/${c.preventivoId}`} className="text-sm font-medium text-blue-800 hover:underline">apri preventivo →</Link>
        </div>
      </div>

      <ApriDaAncora />
      {/* PASSO IN CORSO */}
      {pp && passoSel && <TestataPasso commessaId={c.id} passo={passoSel} precedente={passoPrecedente(pp.passi, passoSel.chiave)} corrente={passoCorr} />}
      {pp && (sel === "FATTURA" || sel === "PROGETTO" || sel === "BENVENUTO") && (
        <PannelloApertura
          passo={sel}
          d={{ commessaId: c.id, cliente: c.cliente.nome, telefono: c.cliente.cellulare ?? c.cliente.telefono ?? null, importoAcconto: c.accontoImporto, legacy: !!percorsoProg?.legacy, fatturaAccontoIl: c.fatturaAccontoIl, fatturaAccontoDaNome: c.fatturaAccontoDaNome, progettoCreatoIl: c.progettoCreatoIl, progettoCreatoDaNome: c.progettoCreatoDaNome, benvenutoIl: c.benvenutoIl, benvenutoDaNome: c.benvenutoDaNome, benvenutoNote: c.benvenutoNote }}
          registraFattura={registraFatturaAcconto} creaProgetto={creaProgetto} registraBenvenuto={registraBenvenuto} ok={pok} avviso={pav}
        />
      )}
      {percorsoProg && percorsoProg.fase !== "DA_CREARE" && mostra("RILIEVO_APP", "RILIEVO", "MATERIALE", "ARRIVO") && <PercorsoProgetto commessaId={c.id} percorso={percorsoProg} creaProgetto={creaProgetto} confermaMateriale={confermaMaterialeProgetto} ok={pok} avviso={pav} />}

      {/* FLUSSO PRATICA FRA UFFICI */}
      <details className="card-fase" style={{ "--fase": "#0ea5e9" } as React.CSSProperties} open={false}>
        <summary className="cursor-pointer list-none"><h2 className="mb-1">✅ Flusso pratica · task fra uffici</h2></summary>
        <p className="text-xs text-neutral-700 mb-3">Premendo <b>Fatto</b> la pratica passa all&apos;ufficio successivo con il task già pronto. Puoi anche inviare un task libero a un ufficio.</p>
        {c.tasks.length > 0 && (
          <div className="mb-3 rounded border border-sky-200 bg-sky-50/60 p-2 text-xs text-neutral-800">
            <p className="mb-1 font-bold text-sky-900">🕒 Passaggi fra uffici (quando è arrivata e quando è stata chiusa)</p>
            <ul className="space-y-0.5">
              {[...c.tasks].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime()).filter((t) => t.faseChiave).map((t) => {
                const fine = t.completatoIl ?? null;
                const giorni = Math.max(0, Math.floor(((fine ?? new Date()).getTime() - t.createdAt.getTime()) / 86400000));
                const d = (x: Date) => x.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
                const ritardo = !fine && t.stato !== "ANNULLATO" && giorni >= 3;
                return (
                  <li key={t.id} className={t.stato === "ANNULLATO" ? "text-neutral-400 line-through" : ""}>
                    <b>{nomeUfficio(t.ufficio)}</b>: {t.titolo} — arrivata il {d(t.createdAt)}
                    {fine ? <> · chiusa il {d(fine)} ({giorni === 0 ? "in giornata" : `${giorni} gg`})</> : t.stato !== "ANNULLATO" && <span className={ritardo ? "font-bold text-red-700" : "font-semibold text-amber-800"}> · ferma da {giorni} gg{ritardo ? " ⚠️ in ritardo" : ""}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 mb-3">
          {c.tasks.length === 0 && (
            <form action={avviaFlussoCommessa} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="commessaId" value={c.id} />
              <p className="text-sm text-neutral-600">Nessun task ancora.</p>
              <select name="fase" className={inp}>
                <option value="ACCETTAZIONE">Parti da: Accettazione (commerciale)</option>
                <option value="FATT_ACCONTO">Parti da: Fattura acconto</option>
                <option value="RILIEVO">Parti da: Rilievo</option>
                <option value="ORDINI">Parti da: Evasione ordini</option>
                <option value="FATT_SALDO">Parti da: Fattura saldo</option>
                <option value="POSA">Parti da: Posa</option>
              </select>
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">Avvia flusso</button>
            </form>
          )}
          {c.tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
        <form action={creaTaskManuale} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="commessaId" value={c.id} />
          <div><label className="text-[11px] font-bold text-neutral-700 block">Invia task a</label>
            <select name="ufficio" className={inp}>{UFFICI.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}</select></div>
          <div className="flex-1 min-w-[200px]"><label className="text-[11px] font-bold text-neutral-700 block">Cosa deve fare</label>
            <input name="titolo" required className={inp + " w-full"} placeholder="es. Verificare pagamento acconto" /></div>
          <div className="flex-1 min-w-[200px]"><label className="text-[11px] font-bold text-neutral-700 block">Note (opz.)</label>
            <input name="descrizione" className={inp + " w-full"} /></div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Invia task</button>
        </form>
      </details>

      {/* ACCONTO */}
      {mostra("INCASSO") && (
      <details id="acconto" className="card-fase scroll-mt-4" style={{ "--fase": "#16a34a" } as React.CSSProperties} open={apre("FATTURA","PROGETTO","BENVENUTO","INCASSO")}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">1 · Acconto / finanziamento</h2></summary>
        <p className="text-sm text-neutral-800 mb-3">
          {finanz ? (
            <>Pagamento tramite <b>finanziamento</b>{c.finanziamentoSocieta ? ` (${c.finanziamentoSocieta})` : ""} — stato: <b>{(c.finanziamentoStato ?? "IN_ISTRUTTORIA").replace("_", " ").toLowerCase()}</b></>
          ) : (
            <>Acconto richiesto: <b>{c.accontoPercentuale}%</b> = <b>{eur(c.accontoImporto)}</b></>
          )}
          {viaLibera && <span className="ml-2 text-green-800 font-semibold">✔ via libera al rilievo</span>}
        </p>

        {!finanz && c.accontoIncassato && (
          <div className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
            Incassato {eur(c.accontoImportoIncassato ?? 0)} il {c.accontoIncassatoIl?.toLocaleDateString("it-IT")}
            {c.accontoModalita ? ` · ${c.accontoModalita}` : ""}{c.accontoNote ? ` · ${c.accontoNote}` : ""}
            {admin && (
              <form action={annullaIncassoAcconto} className="inline ml-3">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-red-700 underline">annulla incasso</button>
              </form>
            )}
          </div>
        )}

        {!finanz && !c.accontoIncassato && gestoreIncassi && (
          <form action={registraIncassoAcconto} className="flex flex-wrap items-end gap-2 mb-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Importo incassato €</label>
              <input name="importo" defaultValue={c.accontoImporto} className={`${inp} w-32`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Modalità</label>
              <select name="modalita" className={inp}>
                <option>Bonifico</option><option>Contanti</option><option>Assegno</option><option>Carta/POS</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Note / riferimento</label>
              <input name="note" className={`${inp} w-56`} />
            </div>
            <button className="btn-3d btn-3d-green text-sm px-4 py-2">Registra incasso acconto</button>
          </form>
        )}
        {!finanz && !c.accontoIncassato && !gestoreIncassi && (
          <p className="text-xs text-neutral-600 mb-3">L&apos;incasso dell&apos;acconto viene registrato dall&apos;amministrazione.</p>
        )}

        {finanz && gestoreIncassi && (
          <form action={aggiornaFinanziamento} className="flex flex-wrap items-end gap-2 mb-3">
            <input type="hidden" name="id" value={c.id} />
            <select name="finanziamentoStato" defaultValue={c.finanziamentoStato ?? "IN_ISTRUTTORIA"} className={inp}>
              <option value="IN_ISTRUTTORIA">In istruttoria</option>
              <option value="APPROVATO">Approvato</option>
              <option value="RIFIUTATO">Rifiutato</option>
            </select>
            <input name="finanziamentoNote" defaultValue={c.finanziamentoNote ?? ""} placeholder="Note pratica" className={`${inp} w-64`} />
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiorna stato</button>
          </form>
        )}

        {admin ? (
          <details className="border-t border-neutral-200 pt-3">
            <summary className="text-xs font-semibold text-neutral-800 cursor-pointer">Modifica condizioni (solo responsabile)</summary>
            <form action={aggiornaCondizioniAcconto} className="flex flex-wrap items-end gap-2 mt-2">
              <input type="hidden" name="id" value={c.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-800">Modalità</label>
                <select name="accontoTipo" defaultValue={c.accontoTipo} className={inp}>
                  <option value="ACCONTO">Acconto</option>
                  <option value="FINANZIAMENTO">Finanziamento</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-800">% acconto</label>
                <input name="accontoPercentuale" defaultValue={c.accontoPercentuale} className={`${inp} w-20`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-800">Importo € (opzionale)</label>
                <input name="accontoImporto" placeholder="auto" className={`${inp} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-800">Società finanziaria</label>
                <input name="finanziamentoSocieta" defaultValue={c.finanziamentoSocieta ?? ""} className={`${inp} w-40`} />
              </div>
              <button className="btn-3d btn-3d-amber text-sm px-4 py-2">Salva condizioni</button>
            </form>
          </details>
        ) : (
          <p className="text-[11px] text-neutral-500 border-t border-neutral-200 pt-2">Le condizioni di acconto (50% o finanziamento) possono essere modificate solo dal responsabile.</p>
        )}
      </details>
      )}

      {/* RILIEVO */}
      {mostra("RILIEVO_APP", "RILIEVO") && (
      <details id="rilievo" className="card-fase" style={{ "--fase": "#2563eb" } as React.CSSProperties} open={apre("RILIEVO_APP","RILIEVO")}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">2 · Rilievo misure</h2></summary>
        {fatto && <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">✅ {fatto}</p>}
        {avvisoRilievo && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{avvisoRilievo}</p>}
        {mostra("RILIEVO_APP") && (
          <>
          {!viaLibera || (percorsoProg && !percorsoProg.progettoCreatoIl && !percorsoProg.legacy) ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {!viaLibera
              ? <>Il rilievo si sblocca dopo l&apos;incasso dell&apos;acconto{finanz ? " (finanziamento approvato)" : ""}.</>
              : <>Il cliente ha pagato: <a href="#progetto" className="underline font-bold">crea il progetto</a> per fissare il rilievo.</>}
          </p>
        ) : (
          <form action={programmaRilievo} className="flex flex-wrap items-end gap-2 mb-4">
            <input type="hidden" name="commessaId" value={c.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Tecnico</label>
              <select name="tecnicoId" required className={inp}>
                <option value="">Seleziona…</option>
                {soloAttivi(tecnici).map((t) => <option key={t.id} value={t.id}>{t.nome}{t.ruolo === "POSATORE" ? " (posatore)" : ""}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Data e ora</label>
              <input type="datetime-local" name="dataOra" required defaultValue={defaultData} className={inp} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Indirizzo (se diverso)</label>
              <input name="indirizzo" placeholder="indirizzo cliente" className={`${inp} w-56`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-800">Note per il tecnico</label>
              <input name="note" className={`${inp} w-56`} />
            </div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 self-center"><input type="hidden" name="conSpuntaCliente" value="1" /><input type="checkbox" name="inviaCliente" value="1" /> ✉️ Invia al cliente</label>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Programma rilievo</button>
          </form>
        )}
          </>
        )}

        <div className="space-y-3">
          {c.rilievi.map((r) => (
            <div key={r.id} className="border border-neutral-200 rounded p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">
                  📅 {r.dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })} · {r.tecnico.nome}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.stato === "ESEGUITO" ? "bg-green-100 text-green-900" : r.stato === "ANNULLATO" ? "bg-red-100 text-red-900" : "bg-indigo-100 text-indigo-900"}`}>{r.stato}</span>
              </div>
              {r.indirizzo && <p className="text-xs text-neutral-700 mt-0.5">📍 {r.indirizzo}</p>}
              {r.note && <p className="text-xs font-bold text-neutral-800">Note: {r.note}</p>}

              {r.stato === "ESEGUITO" && (
                <div className="mt-2">
                  {r.misure && <pre className="text-xs whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded p-2 text-neutral-900">{r.misure}</pre>}
                  {r.allegati.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.allegati.map((a) => /\.pdf$/i.test(a.nome ?? "") ? (
                        <a key={a.id} href={`/api/foto/rilievo/${a.id}`} target="_blank" rel="noreferrer" title={a.nome ?? "PDF"} className="h-24 w-24 rounded border border-red-200 bg-red-50 flex flex-col items-center justify-center text-xs text-red-900 px-1 text-center hover:border-red-400">
                          <span className="text-2xl">📄</span><span className="truncate w-full">{a.nome}</span>
                        </a>
                      ) : (
                        <a key={a.id} href={`/api/foto/rilievo/${a.id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/foto/rilievo/${a.id}`} loading="lazy" alt={a.nome ?? "foto rilievo"} className="h-24 w-24 object-cover rounded border border-neutral-300" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {r.stato !== "ANNULLATO" && (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/commesse/${c.id}?passo=RILIEVO&carica=${r.id}`} className="btn-3d btn-3d-blue text-sm px-5 py-2.5">
                    {r.stato === "ESEGUITO" ? "✏️ Rivedi il rilievo e il verbale" : "📋 Carica il rilievo"}
                  </Link>
                  {r.stato === "ESEGUITO" && <Link href={`/commesse/${c.id}/rilievo/${r.id}/stampa`} className="btn-3d btn-3d-outline text-sm px-4 py-2.5">🖨️ Stampa verbale e rilievo</Link>}
                </div>
                <details className="mt-2">
                  <summary className="text-xs font-bold text-neutral-700 cursor-pointer">📂 Altri file della pratica</summary>
                  <div className="mt-3 rounded border border-blue-200 bg-blue-50/40 p-2">
                    <p className="text-xs font-bold text-neutral-800 mb-1">📂 Cartella «Rilievi misura» della pratica ({fileRilievi.length} file)</p>
                    {fileRilievi.length ? (
                      <ul className="mb-2 divide-y divide-neutral-100 text-sm">
                        {fileRilievi.map((d) => (
                          <li key={d.id} className="py-1 flex flex-wrap items-center gap-x-3">
                            <a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-blue-800 underline break-all">📄 {d.nome}</a>
                            <span className="text-xs text-neutral-500">{d.createdAt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}{d.caricatoDaNome ? ` · ${d.caricatoDaNome}` : ""}</span>
                            <a href={`/api/documenti/${d.id}?scarica=1`} className="text-xs text-neutral-700 underline">scarica</a>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mb-2 text-xs text-neutral-500">Nessun file ancora in questa cartella.</p>}
                    <CaricaDocumenti entita="COMMESSA" entitaId={c.id} cartelle={["Rilievi misura"]} />
                  </div>
                </details>
              </>
              )}
              {r.stato === "PROGRAMMATO" && (
                <form action={annullaRilievo} className="mt-1">
                  <input type="hidden" name="rilievoId" value={r.id} />
                  <button className="text-xs text-red-700 underline">annulla rilievo</button>
                </form>
              )}
            </div>
          ))}
          {c.rilievi.length === 0 && <p className="text-xs text-neutral-600">Nessun rilievo programmato.</p>}
        </div>

      </details>
      )}


      {/* FASI */}
      <details className="card-fase" style={{ "--fase": "#7c3aed" } as React.CSSProperties} open={false}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">3 · Fasi della commessa</h2></summary>
        {c.fasi.length === 0 ? (
          <form action={generaFasiStandard}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-purple text-sm px-4 py-2">Genera fasi standard</button>
          </form>
        ) : (
          <div className="space-y-2">
            {c.fasi.map((f) => (
              <div key={f.id} className="border border-neutral-200 rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900">{f.ordine}. {f.nome}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${f.stato === "CHIUSA" ? "bg-green-100 text-green-900" : f.stato === "IN_CORSO" ? "bg-indigo-100 text-indigo-900" : "bg-neutral-200 text-neutral-800"}`}>
                    {f.stato === "CHIUSA" ? "CHIUSA" : f.stato === "IN_CORSO" ? "IN CORSO" : "DA FARE"}
                  </span>
                </div>
                {f.stato === "CHIUSA" ? (
                  <div className="text-xs text-neutral-800 mt-1">
                    Chiusa da <b>{f.chiusaDaNome}</b> il {f.chiusaIl?.toLocaleDateString("it-IT")} · {f.forfait !== null ? `forfait ${eur(f.forfait)}` : `${f.ore ?? 0} h × ${eur(f.costoOrario ?? 0)}/h`} = <b>{eur(f.costoTotale)}</b>
                    {f.note ? ` · ${f.note}` : ""}
                    {admin && (
                      <form action={riapriFase} className="inline ml-3">
                        <input type="hidden" name="faseId" value={f.id} />
                        <button className="text-red-700 underline">riapri</button>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <form action={assegnaFase} className="flex items-center gap-2">
                      <input type="hidden" name="faseId" value={f.id} />
                      <select name="assegnatario" defaultValue={f.assegnatoUtenteId ? `U:${f.assegnatoUtenteId}` : f.assegnatoSoggettoId ? `S:${f.assegnatoSoggettoId}` : ""} className={inp}>
                        <option value="">Assegna a…</option>
                        <optgroup label="Utenti CRM">
                          {soloAttivi(tecnici, f.assegnatoUtenteId).map((t) => <option key={t.id} value={`U:${t.id}`}>{t.nome}</option>)}
                        </optgroup>
                        {soggettiOperativi.length > 0 && (
                          <optgroup label="Posatori / tecnici in anagrafica">
                            {soggettiOperativi.map((t) => <option key={t.id} value={`S:${t.id}`}>{t.ragioneSociale}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <button className="btn-3d btn-3d-dark text-[11px] px-2 py-1">assegna</button>
                      {f.assegnatoNome && <span className="text-xs font-bold text-neutral-800">Assegnata a <b>{f.assegnatoNome}</b></span>}
                    </form>
                    <form action={chiudiFase} className="flex flex-wrap items-end gap-2 bg-neutral-50 border border-neutral-200 rounded p-2">
                      <input type="hidden" name="faseId" value={f.id} />
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-neutral-800">Ore lavorate</label>
                        <input name="ore" className={`${inp} w-20`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-neutral-800">Costo orario €</label>
                        <input name="costoOrario" defaultValue={costoOrarioUtente(utente?.id) as string | number} className={`${inp} w-24`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-neutral-800">oppure forfait €</label>
                        <input name="forfait" className={`${inp} w-24`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-neutral-800">Note</label>
                        <input name="note" className={`${inp} w-48`} />
                      </div>
                      <button className="btn-3d btn-3d-green text-sm px-4 py-2">Chiudi fase</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <form action={aggiungiFase} className="flex gap-2 mt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="nome" placeholder="Nuova fase (es. Sopralluogo muratore)" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-purple text-sm px-4 py-2">Aggiungi fase</button>
        </form>
      </details>

      {/* EVASIONE ORDINI */}
      {mostra("MATERIALE", "ARRIVO") && (
      <details id="evasione" className="card-fase scroll-mt-4" style={{ "--fase": "#ea580c" } as React.CSSProperties} open={apre("MATERIALE","ARRIVO")}>
        <summary className="cursor-pointer list-none"><h2 className="mb-1">4 · Evasione ordini e acquisti</h2></summary>
        <p className="text-xs text-neutral-600 mb-3">Dal materiale qui sotto si creano gli ordini ai fornitori. Quando la merce arriva spunta &quot;arrivato&quot; e inserisci il costo reale.</p>
        <div id="materiale-pratica" className="mb-4 rounded border border-orange-200 bg-white p-3 scroll-mt-4">
          <p className="text-sm font-bold text-neutral-900">📦 Materiale della pratica <span className="font-normal text-neutral-600">— quello dell&apos;offerta più quello aggiunto al rilievo</span></p>
          <p className="text-xs text-neutral-600 mb-2"><b>Spunta le righe</b>: in fondo allo schermo compaiono le azioni (ordine al fornitore, sposta in un altro progetto, task, togli). L&apos;ordine parte da {EMAIL_ORDINI()} con la lista senza prezzi e i PDF del rilievo che scegli.</p>
          {fattoMateriale && <p className="text-xs text-green-900 bg-green-50 border border-green-200 rounded px-2 py-1 mb-2">✅ {fattoMateriale}</p>}
          {avviso && <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">{avviso}</p>}
          {materialeTutto.length === 0 ? (
            <form action={generaRigheOrdine} className="mb-3"><input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-blue-800 underline">Carica il materiale dell&apos;offerta</button></form>
          ) : (
            <form action={creaOrdineDaRighe} className="mb-3">
              <input type="hidden" name="commessaId" value={c.id} />
              {materialePratica.length === 0 && <p className="text-xs text-green-900 bg-green-50 border border-green-200 rounded px-2 py-1 mb-2">Niente da ordinare: tutto il materiale è già stato ordinato (vedi sotto).</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="py-1 w-6"></th><th>Descrizione</th><th className="text-right pr-3">Q.tà</th><th>Fornitore</th><th>Stato</th><th className="text-right">Costo previsto</th><th></th></tr></thead>
                  <tbody>
                    {materialePratica.map((r) => {
                      const libera = !r.ordineFornitoreId && !r.ordinato && !r.daMagazzino;
                      return (
                        <tr key={r.id} className="border-b border-neutral-100 align-top">
                          <td className="py-1.5"><input type="checkbox" name="riga" value={r.id} aria-label={`Spunta ${r.descrizione}`} /></td>
                          <td className="py-1.5 pr-2">{r.kitDiId ? <span className="text-[10px] font-bold mr-1.5 px-1 rounded bg-indigo-100 text-indigo-900" title="Pezzo della distinta base: solo acquisto">🔗 KIT di {nomeRiga.get(r.kitDiId) ?? "—"}</span> : r.complemento && <span className="text-[10px] font-bold mr-1.5 px-1 rounded bg-teal-100 text-teal-900" title="Aggiunto al rilievo: solo acquisto">🧩 COMPLEMENTO</span>}{r.descrizione}{r.note ? <span className="text-xs text-neutral-600"> ({r.note})</span> : null}</td>
                          <td className="py-1.5 text-right pr-3">{r.quantita}</td>
                          <td className="py-1.5 text-xs">{libera && puoGestireOrdini(utente)
                            ? <FornitoreRiga rigaId={r.id} fornitoreId={r.fornitoreId} fornitori={fornitoriLista} azione={impostaFornitoreRiga} />
                            : (r.fornitoreNome ?? <span className="text-amber-800">da scegliere</span>)}</td>
                          <td className="py-1.5 text-xs">{r.ordineFornitore
                            ? <Link href={`/ordini-fornitori/${r.ordineFornitore.id}`} className="text-purple-800 underline">ordine {r.ordineFornitore.numero}/{r.ordineFornitore.anno}</Link>
                            : r.daMagazzino ? "dal magazzino" : r.ordinato ? "ordinato" : <span className="text-amber-800">da ordinare</span>}</td>
                          <td className="py-1.5 text-right text-xs">{r.costoPrevisto !== null ? eur(r.costoPrevisto) : ""}</td>
                          <td className="py-1.5 text-right">{r.complemento && libera && <button formAction={eliminaComplemento} name="rigaId" value={r.id} className="text-xs text-red-700 underline">togli</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <BarraAzioniMateriale fornitori={fornitoriLista} progetti={altriProgetti} uffici={UFFICI} puoOrdinare={puoGestireOrdini(utente)}
                azioni={{ ordine: creaOrdineDaRighe, sposta: spostaRigheProgetto, task: taskDaRighe, elimina: eliminaRigheMateriale }} />
            </form>
          )}
          {materialeOrdinato.length > 0 && (
            <div className="mt-3 rounded border border-green-200 bg-green-50/40 p-3">
              <p className="text-sm font-bold text-green-900">✅ Ordinato — in attesa della conferma e dell&apos;arrivo <span className="font-normal text-neutral-600">({materialeOrdinato.length})</span></p>
              <p className="text-xs text-neutral-600 mb-2">Queste righe non si modificano più. Quando la merce arriva si controllano costi e magazzino dall&apos;ordine.</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-neutral-600 border-b border-green-200"><th>Descrizione</th><th className="text-right pr-3">Q.tà</th><th>Fornitore</th><th>Stato</th><th className="text-right">Costo previsto</th></tr></thead>
                <tbody>
                  {materialeOrdinato.map((r) => {
                    const st = r.arrivato ? "📦 Arrivato" : r.daMagazzino ? "dal magazzino" : r.ordineFornitore?.stato === "CONFERMATO" ? "Confermato — attendo la merce" : r.ordineFornitore?.stato === "EVASO" || r.ordineFornitore?.stato === "EVASO_PARZIALE" ? "Merce in arrivo" : "In attesa di conferma";
                    return (
                      <tr key={r.id} className="border-b border-green-100 align-top text-neutral-700">
                        <td className="py-1.5 pr-2">{r.descrizione}{r.note ? <span className="text-xs text-neutral-600"> ({r.note})</span> : null}</td>
                        <td className="py-1.5 text-right pr-3">{r.quantita}</td>
                        <td className="py-1.5 text-xs">{r.fornitoreNome ?? "—"}</td>
                        <td className="py-1.5 text-xs">{r.ordineFornitore ? <Link href={`/ordini-fornitori/${r.ordineFornitore.id}`} className="text-purple-800 underline">ordine {r.ordineFornitore.numero}/{r.ordineFornitore.anno}</Link> : "ordinato"} · <b>{st}</b></td>
                        <td className="py-1.5 text-right text-xs">{r.costoPrevisto !== null ? eur(r.costoPrevisto) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {correlatiSuggeriti.length > 0 && (
            <div className="mt-2 rounded border border-indigo-200 bg-indigo-50/50 p-2">
              <p className="text-xs font-bold text-indigo-900 mb-1">🔗 Correlati suggeriti (distinta base, facoltativi)</p>
              <ul className="text-sm divide-y divide-indigo-100">
                {correlatiSuggeriti.map((x) => (
                  <li key={`${x.rigaId}-${x.componenteId}`} className="py-1 flex flex-wrap items-center gap-2">
                    <span>{x.descrizione}</span><span className="text-xs text-neutral-600">per «{x.madre}» · {x.come}</span>
                    <form action={aggiungiCorrelato}><input type="hidden" name="rigaId" value={x.rigaId} /><input type="hidden" name="componenteId" value={x.componenteId} />
                      <button className="btn-3d btn-3d-teal text-[11px] px-2 py-0.5">➕ aggiungi</button></form>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details open={!!fattoMateriale?.startsWith("Aggiunto")} className="mt-2 rounded border border-blue-200 bg-blue-50/40 p-2">
            <summary className="cursor-pointer text-sm font-bold text-blue-900">📚 Aggiungi materiale dal listino (Indoor / Outdoor, come nell&apos;offerta) — solo acquisto</summary>
            <div className="mt-2">
              <SelettoreProdotto preventivoId={c.id} brandId={c.brandId} brandColor="#1d4ed8" tassonomia={tassonomia} azionePerMisura={complementoDaListinoPerMisura} azionePerProdotto={complementoDaListino} />
            </div>
          </details>
        </div>
        <StatoAcquisti commessaId={c.id} puoGestire={puoGestireOrdini(utente)} />
        <MaterialeCommessa commessaId={c.id} puoGestire={puoGestireOrdini(utente)} />
        <div className="bg-amber-50 border border-amber-300 rounded p-3 mb-4">
          <p className="text-sm font-bold text-neutral-900 mb-1">Modo rapido: totale acquisto materiali{haAcquistiTotali ? ` — registrato ${eur(totaleAcquisti)}` : ""}</p>
          <p className="text-xs text-neutral-700 mb-2">Inserisci un solo importo per fornitore/fattura invece del costo di ogni riga. Se presente, sostituisce i costi per riga nella scheda costi.</p>
          <form action={aggiungiCostoManuale} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="commessaId" value={c.id} />
            <input type="hidden" name="categoria" value="ACQUISTO_MATERIALE" />
            <select name="fornitoreId" className={inp}>
              <option value="">Fornitore…</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
            </select>
            <input name="fatturaNumero" placeholder="N° fattura" className={`${inp} w-28`} />
            <input name="importo" placeholder="Totale acquisto €" required className={`${inp} w-36 border-amber-400`} />
            <button className="btn-3d btn-3d-amber text-sm px-4 py-2">Aggiungi acquisto</button>
          </form>
          {c.costiManuali.filter((m) => m.categoria === "ACQUISTO_MATERIALE").map((m) => (
            <div key={m.id} className="text-xs text-neutral-900 mt-1">• {m.descrizione}: <b>{eur(m.importo)}</b>
              {gestoreIncassi && (
                <form action={eliminaCostoManuale} className="inline ml-2"><input type="hidden" name="id" value={m.id} /><button className="text-red-700 underline">elimina</button></form>
              )}
            </div>
          ))}
        </div>
        {c.righeOrdine.length === 0 ? (
          <form action={generaRigheOrdine}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-purple text-sm px-4 py-2">Genera elenco dalle righe del preventivo</button>
          </form>
        ) : (
          <div className="space-y-2">
            {c.righeOrdine.map((r) => (
              <form key={r.id} action={aggiornaRigaOrdine} className={`border rounded p-2 ${r.arrivato ? "border-green-300 bg-green-50" : r.ordinato ? "border-indigo-200 bg-indigo-50" : "border-neutral-200"}`}>
                <input type="hidden" name="rigaId" value={r.id} />
                <p className="text-sm font-medium text-neutral-900">{r.complemento && <span className="text-[10px] font-bold mr-1.5 px-1 rounded bg-teal-100 text-teal-900" title="Aggiunto al rilievo: solo acquisto, la vendita non cambia">🧩 COMPLEMENTO</span>}{r.descrizione} <span className="text-xs text-neutral-600">× {r.quantita}</span>
                  {r.ordineFornitore && <Link href={`/ordini-fornitori/${r.ordineFornitore.id}`} className="ml-2 text-xs text-purple-800 underline">ordine {r.ordineFornitore.numero}/{r.ordineFornitore.anno}</Link>}
                  {r.costoPrevisto !== null && <span className="ml-2 text-xs text-neutral-600">costo previsto {eur(r.costoPrevisto)}</span>}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <select name="fornitoreId" defaultValue={r.fornitoreId ?? ""} disabled={!!r.ordineFornitoreId} title={r.ordineFornitoreId ? "La riga è già in un ordine: se non è ancora inviato, cambi il fornitore dall'ordine (↪ Ordina da un altro fornitore)" : undefined} className={inp}>
                    <option value="">Fornitore…</option>
                    {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-neutral-900"><input type="checkbox" name="ordinato" defaultChecked={r.ordinato} /> Ordinato{r.ordinatoIl ? ` (${r.ordinatoIl.toLocaleDateString("it-IT")})` : ""}</label>
                  <label className="flex items-center gap-1 text-xs text-neutral-900"><input type="checkbox" name="arrivato" defaultChecked={r.arrivato} /> Arrivato{r.arrivatoIl ? ` (${r.arrivatoIl.toLocaleDateString("it-IT")})` : ""}</label>
                  {venditaRiga(r.rigaPreventivoId) !== null && (
                    <span className="text-xs font-bold text-neutral-800">Vendita <b>{eur(venditaRiga(r.rigaPreventivoId) ?? 0)}</b></span>
                  )}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-neutral-600">Costo d&apos;acquisto €</label>
                    <input name="costoEffettivo" defaultValue={r.costoEffettivo ?? ""} placeholder="inserisci quando noto" className={`${inp} w-36 border-amber-400`} />
                  </div>
                  {r.costoEffettivo !== null && venditaRiga(r.rigaPreventivoId) !== null && (
                    <span className="text-xs text-green-900">margine riga <b>{eur((venditaRiga(r.rigaPreventivoId) ?? 0) - (r.costoEffettivo ?? 0))}</b></span>
                  )}
                  <input name="note" defaultValue={r.note ?? ""} placeholder="Note" className={`${inp} w-40`} />
                  <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva</button>
                </div>
              </form>
            ))}
            <form action={generaRigheOrdine}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-blue-800 underline">Aggiorna elenco con eventuali righe nuove del preventivo</button>
            </form>
          </div>
        )}
      </details>
      )}

      {/* SCHEDA COSTI A SCALARE */}
      {mostra("MATERIALE", "ARRIVO") && (
      <details id="costi" className="card-fase scroll-mt-4" style={{ "--fase": "#0d9488" } as React.CSSProperties} open={false}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">5 · Scheda costi a scalare</h2></summary>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Vendita (imponibile)</p><p className="text-sm font-bold">{eur(c.totaleImponibile)}</p></div>
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Costi registrati</p><p className="text-sm font-bold">{eur(totaleCosti)}</p></div>
          <div className={`rounded border p-3 ${margine < 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}><p className="text-xs text-neutral-600">Margine residuo</p><p className="text-sm font-bold">{eur(margine)}</p></div>
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Margine %</p><p className="text-sm font-bold">{marginePerc.toFixed(1)}%</p></div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-600 border-b border-neutral-200">
              <th className="py-1">Data</th><th>Voce</th><th>Tipo</th><th className="text-right">Costo</th><th className="text-right">Residuo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <td className="py-1.5">{c.createdAt.toLocaleDateString("it-IT")}</td><td className="font-medium">Valore commessa (imponibile)</td><td></td><td></td><td className="text-right font-semibold">{eur(c.totaleImponibile)}</td>
            </tr>
            {movimenti.map((m, i) => {
              residuo -= m.importo;
              return (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1.5">{m.data.toLocaleDateString("it-IT")}</td>
                  <td>{m.voce}</td>
                  <td className="text-xs text-neutral-600">{m.tipo}</td>
                  <td className="text-right text-red-800">− {eur(m.importo)}</td>
                  <td className={`text-right font-semibold ${residuo < 0 ? "text-red-700" : "text-neutral-900"}`}>{eur(residuo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(righeSenzaCosto > 0 || fasiAperte > 0) && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
            Costi ancora da consuntivare: {righeSenzaCosto} righe merce senza costo reale · {fasiAperte} fasi non chiuse. Il margine mostrato si aggiorna man mano.
          </p>
        )}
        <form action={aggiungiCostoManuale} className="flex flex-wrap items-end gap-2 mt-4 border-t border-neutral-200 pt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="descrizione" placeholder="Altro costo (trasporto, noleggio…)" className={`${inp} w-64`} required />
          <select name="categoria" className={inp}><option value="ALTRO">Altro</option><option value="Trasporto">Trasporto</option><option value="Noleggio">Noleggio</option><option value="Materiale">Materiale</option></select>
          <input name="importo" placeholder="Importo €" className={`${inp} w-28`} required />
          <button className="btn-3d btn-3d-amber text-sm px-4 py-2">Aggiungi costo</button>
        </form>
        {c.costiManuali.length > 0 && gestoreIncassi && (
          <div className="mt-2 flex flex-wrap gap-2">
            {c.costiManuali.map((m) => (
              <form key={m.id} action={eliminaCostoManuale} className="text-[11px] font-bold text-neutral-800">
                <input type="hidden" name="id" value={m.id} />
                {m.descrizione} <button className="text-red-700 underline">elimina</button>
              </form>
            ))}
          </div>
        )}
      </details>
      )}

      {/* SALDO */}
      {mostra("SALDO", "POSA_APP") && (
      <details className="card-fase" style={{ "--fase": "#db2777" } as React.CSSProperties} open={apre("SALDO")}>
        <summary className="cursor-pointer list-none"><h2 className="mb-1">6 · Saldo e conferma posa</h2></summary>
        <p className="text-xs text-neutral-600 mb-3">Il saldo (fattura) si incassa prima dell&apos;uscita del materiale; dopo il saldo parte la conferma del giorno di posa al cliente.</p>
        {c.saldoIncassato ? (
          <div className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2">
            ✔ Saldo incassato {eur(c.saldoImporto ?? 0)} il {c.saldoIncassatoIl?.toLocaleDateString("it-IT")}
            {c.fatturaSaldoNumero ? ` · fattura n. ${c.fatturaSaldoNumero}` : ""}{c.saldoModalita ? ` · ${c.saldoModalita}` : ""}
            {admin && (
              <form action={annullaSaldo} className="inline ml-3"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">annulla saldo</button></form>
            )}
          </div>
        ) : gestoreIncassi ? (
          <form action={registraSaldo} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Importo saldo €</label><input name="importo" defaultValue={Math.max(0, Math.round((c.totaleVendita - (c.accontoIncassato ? (c.accontoImportoIncassato ?? c.accontoImporto) : 0)) * 100) / 100)} className={`${inp} w-32`} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">N° fattura saldo</label><input name="fatturaNumero" className={`${inp} w-32`} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Data fattura</label><input type="date" name="fatturaData" className={inp} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Modalità</label><select name="modalita" className={inp}><option>Bonifico</option><option>Contanti</option><option>Assegno</option><option>Carta/POS</option><option>Finanziamento</option></select></div>
            <button className="btn-3d btn-3d-green text-sm px-4 py-2">Registra saldo incassato</button>
          </form>
        ) : (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">In attesa del saldo: lo registra l&apos;amministrazione.</p>
        )}
      </details>
      )}

      {/* POSA E FINE LAVORI */}
      {mostra("POSA_APP", "POSA") && (
      <details id="posa" className="card-fase scroll-mt-4" style={{ "--fase": "#f59e0b" } as React.CSSProperties} open={apre("POSA_APP","POSA")}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">7 · Posa e fine lavori</h2></summary>
        {mostra("POSA_APP") && (
        <form action={programmaPosa} className="flex flex-wrap items-end gap-2 mb-4">
          <input type="hidden" name="commessaId" value={c.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-800">Squadra / posatore</label>
            <select name="assegnatario" className={inp}>
              <option value="">Seleziona…</option>
              <optgroup label="Interni (utenti CRM)">
                {soloAttivi(tecnici).map((t) => <option key={t.id} value={`U:${t.id}`}>{t.nome}</option>)}
              </optgroup>
              {soggettiOperativi.length > 0 && (
                <optgroup label="Anagrafica (interni ed esterni)">
                  {soggettiOperativi.map((t) => <option key={t.id} value={`S:${t.id}`}>{t.ragioneSociale}{t.ruoli.includes("POSATORE_ESTERNO") ? " (esterno)" : ""}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Inizio posa</label><input type="datetime-local" name="dataInizio" required defaultValue={defaultData} className={inp} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Giorni</label><input name="giorniPrevisti" defaultValue="1" className={`${inp} w-16`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Altri nella squadra</label><input name="squadra" className={`${inp} w-44`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Indirizzo (se diverso)</label><input name="indirizzo" className={`${inp} w-48`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-bold text-neutral-800">Note per la squadra</label><input name="note" className={`${inp} w-48`} /></div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 self-center"><input type="hidden" name="conSpuntaCliente" value="1" /><input type="checkbox" name="inviaCliente" value="1" /> ✉️ Invia al cliente</label>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Programma posa</button>
        </form>
        )}

        <div className="space-y-3">
          {c.pose.map((p) => (
            <div key={p.id} className="border border-neutral-200 rounded p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">
                  🛠️ dal {p.dataInizio.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} · {p.giorniPrevisti} gg · {p.tipo === "ESTERNA" ? "esterna" : "interna"}{p.assegnatoNome ? ` · ${p.assegnatoNome}` : ""}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${p.stato === "COMPLETATA" ? "bg-green-100 text-green-900" : p.stato === "IN_CORSO" ? "bg-indigo-100 text-indigo-900" : p.stato === "ANNULLATA" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{p.stato.replace("_", " ")}</span>
              </div>
              {p.squadra && <p className="text-xs font-bold text-neutral-800">Squadra: {p.squadra}</p>}
              {p.indirizzo && <p className="text-xs font-bold text-neutral-800">📍 {p.indirizzo}</p>}
              {p.note && <p className="text-xs font-bold text-neutral-800">Note: {p.note}</p>}

              {p.foto.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.foto.map((f) => (
                    <a key={f.id} href={`/api/foto/posa/${f.id}`} target="_blank" rel="noreferrer" className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/foto/posa/${f.id}`} loading="lazy" alt={f.nome ?? "foto posa"} className="h-20 w-20 object-cover rounded border border-neutral-300" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center">{f.categoria.toLowerCase()}</span>
                    </a>
                  ))}
                </div>
              )}

              {p.stato === "COMPLETATA" && (
                <div className="mt-2 text-xs text-neutral-900 bg-green-50 border border-green-200 rounded p-2">
                  Completata il {p.completataIl?.toLocaleString("it-IT")}{p.noteFine ? ` · ${p.noteFine}` : ""}
                  {p.firmaCliente && (
                    <div className="mt-1">
                      Firmato da <b>{p.nomeFirmatario ?? "cliente"}</b>:
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.firmaCliente} alt="firma cliente" className="h-14 bg-white border border-neutral-300 rounded mt-1" />
                    </div>
                  )}
                </div>
              )}

              {(p.stato === "PROGRAMMATA" || p.stato === "IN_CORSO") && (
                <div className="mt-2 space-y-2">
                  {p.stato === "PROGRAMMATA" && !c.saldoIncassato && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">Saldo non ancora incassato: la conferma del giorno di posa e l&apos;uscita del materiale restano bloccate.</p>
                  )}
                  {p.stato === "PROGRAMMATA" && c.saldoIncassato && !p.confermata && (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={confermaGiornoPosa} className="inline">
                        <input type="hidden" name="posaId" value={p.id} />
                        <button className="btn-3d btn-3d-purple text-sm px-4 py-2">Conferma giorno di posa</button>
                      </form>
                      {c.cliente.email && (
                        <a
                          className="text-xs text-blue-800 underline"
                          href={`mailto:${c.cliente.email}?subject=${encodeURIComponent("Conferma giorno di posa — commessa " + numeroCommessa(c))}&body=${encodeURIComponent(`Gentile ${c.cliente.nome},\n\nconfermiamo che la posa avrà inizio il ${p.dataInizio.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} (durata prevista ${p.giorniPrevisti} giorni).\n\nCordiali saluti`)}`}
                        >
                          ✉ scrivi la conferma al cliente
                        </a>
                      )}
                    </div>
                  )}
                  {p.confermata && p.stato === "PROGRAMMATA" && (
                    <p className="text-xs text-green-900">✔ Giorno di posa confermato il {p.confermataIl?.toLocaleDateString("it-IT")}</p>
                  )}
                  {p.stato === "PROGRAMMATA" && c.saldoIncassato && (
                    <form action={avviaPosa} className="inline">
                      <input type="hidden" name="posaId" value={p.id} />
                      <button className="btn-3d btn-3d-teal text-sm px-4 py-2">Avvia posa</button>
                    </form>
                  )}
                  <details>
                    <summary className="text-sm font-bold text-blue-800 cursor-pointer">Carica foto (prima / durante / problemi)</summary>
                    <form action={caricaFotoPosa} className="mt-2 space-y-2">
                      <input type="hidden" name="posaId" value={p.id} />
                      <select name="categoria" className={inp}><option value="PRIMA">Prima</option><option value="DURANTE">Durante</option><option value="PROBLEMA">Problema</option></select>
                      <FotoRilievo name="foto" />
                      <button className="btn-3d btn-3d-pink text-sm px-4 py-2">Salva foto</button>
                    </form>
                  </details>
                  <details>
                    <summary className="text-xs font-semibold text-green-800 cursor-pointer">Fine lavori: verbale, firma e costo</summary>
                    <form action={completaPosa} className="mt-2 space-y-2">
                      <input type="hidden" name="posaId" value={p.id} />
                      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-900 bg-neutral-50 border border-neutral-200 rounded p-2">
                        <span className="font-bold">Come è finita la posa?</span>
                        <label className="flex items-center gap-1"><input type="radio" name="esitoPosa" value="COMPLETA" defaultChecked /> Finita: al cliente la richiesta di recensione, il commerciale porta il kit</label>
                        <label className="flex items-center gap-1"><input type="radio" name="esitoPosa" value="PARZIALE" /> Parziale: al cliente le scuse, si fissa un&apos;altra data</label>
                        <label className="flex items-center gap-1 font-bold"><input type="hidden" name="conSpuntaCliente" value="1" /><input type="checkbox" name="inviaCliente" value="1" /> ✉️ Invia al cliente</label>
                      </div>
                      <textarea name="noteFine" rows={3} placeholder="Note di fine lavori, eventuali riserve…" className={`${inp} w-full`} />
                      <FotoRilievo name="foto" />
                      <input name="nomeFirmatario" placeholder="Nome di chi firma" className={`${inp} w-64`} />
                      <FirmaCliente name="firmaCliente" />
                      <div className="bg-neutral-50 border border-neutral-200 rounded p-2 space-y-2">
                        <p className="text-xs font-bold text-neutral-800">Costo posa</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-900">
                          <label className="flex items-center gap-1"><input type="radio" name="tipoCosto" value="INTERNA" defaultChecked={p.tipo !== "ESTERNA"} /> Posa interna (ore × costo orario)</label>
                          <label className="flex items-center gap-1"><input type="radio" name="tipoCosto" value="ESTERNA" defaultChecked={p.tipo === "ESTERNA"} /> Squadra esterna (fattura)</label>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Ore totali</label><input name="ore" className={`${inp} w-20`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Costo orario €</label><input name="costoOrario" defaultValue={costoOrarioUtente(p.assegnatoUtenteId) as string | number} className={`${inp} w-24`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">oppure forfait interno €</label><input name="forfait" className={`${inp} w-28`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Fattura squadra n°</label><input name="fatturaNumero" className={`${inp} w-28`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Importo fattura €</label><input name="fatturaImporto" className={`${inp} w-28`} /></div>
                        </div>
                      </div>
                      <button className="btn-3d btn-3d-green text-sm px-4 py-2">Chiudi posa e fine lavori</button>
                    </form>
                  </details>
                  <form action={annullaPosa}><input type="hidden" name="posaId" value={p.id} /><button className="text-xs text-red-700 underline">annulla posa</button></form>
                </div>
              )}
            </div>
          ))}
          {c.pose.length === 0 && <p className="text-xs text-neutral-600">Nessuna posa programmata.</p>}
        </div>
      </details>
      )}

      {/* CHIUSURA */}
      {mostra("KIT") && (c.stato === "LAVORI_ESEGUITI" || c.stato === "CHIUSA") && (
        <details className="card-fase" style={{ "--fase": "#16a34a" } as React.CSSProperties} open={apre("KIT")}>
          <summary className="cursor-pointer list-none"><h2 className="mb-3">8 · Chiusura commessa</h2></summary>
          {c.stato === "CHIUSA" ? (
            <div className="text-sm text-neutral-900 space-y-1">
              <p className="text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2">✔ Commessa chiusa il {c.chiusaIl?.toLocaleDateString("it-IT")} · garanzia {c.garanziaMesi} mesi{c.fatturaFinaleNote ? ` · ${c.fatturaFinaleNote}` : ""}</p>
              {admin && <form action={riapriCommessa}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">riapri commessa</button></form>}
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="text-xs text-neutral-900 space-y-1">
                <li>{c.saldoIncassato ? "✔" : "✖"} Saldo incassato</li>
                <li>{fasiAperte === 0 ? "✔" : "✖"} Fasi chiuse{fasiAperte ? ` (${fasiAperte} aperte)` : ""}</li>
                <li>{righeSenzaCosto === 0 ? "✔" : "✖"} Costi di acquisto inseriti{righeSenzaCosto ? ` (mancano ${righeSenzaCosto} righe)` : ""}</li>
              </ul>
              <p className="text-xs font-bold text-neutral-800">Margine finale: <b>{eur(margine)}</b> ({marginePerc.toFixed(1)}%)</p>
              {gestoreIncassi ? (
                <form action={chiudiCommessa} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="fatturaFinaleNote" placeholder="Note fatturazione finale" className={`${inp} w-64`} />
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Garanzia (mesi)</label><input name="garanziaMesi" defaultValue={24} className={`${inp} w-20`} /></div>
                  <button className="btn-3d btn-3d-green text-sm px-4 py-2">Chiudi commessa</button>
                </form>
              ) : <p className="text-xs text-amber-900">La chiusura la fa l&apos;amministrazione.</p>}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {c.cliente.email && (
                  <a className="text-blue-800 underline" href={`mailto:${c.cliente.email}?subject=${encodeURIComponent("Come è andata la posa?")}&body=${encodeURIComponent(`Gentile ${c.cliente.nome},\n\ngrazie per averci scelto. Se è soddisfatto del lavoro, ci farebbe piacere una sua recensione.\n\nCordiali saluti`)}`}>✉ chiedi recensione al cliente</a>
                )}
                <form action={segnaRecensioneRichiesta}><input type="hidden" name="id" value={c.id} /><button className="text-neutral-700 underline">segna recensione richiesta</button></form>
                {c.recensioneRichiestaIl && <span className="text-green-900">richiesta il {c.recensioneRichiestaIl.toLocaleDateString("it-IT")}</span>}
              </div>
            </div>
          )}
        </details>
      )}

      {/* KIT AL CLIENTE (raccolta punti) */}
      {mostra("POSA", "KIT") && <KitCliente commessaId={c.id} stato={c.stato} commercialeId={c.preventivo.commercialeId} utente={utente} ok={kitOk} errore={kitErrore} />}

      {/* ASSISTENZA */}
      <details className="card-fase" style={{ "--fase": "#dc2626" } as React.CSSProperties} open={false}>
        <div className="flex items-center justify-between mb-3">
          <summary className="cursor-pointer list-none"><h2>Assistenza ({c.assistenze.length})</h2></summary>
          <Link href="/assistenza" className="text-xs text-blue-800 underline">tutte le assistenze</Link>
        </div>
        {c.assistenze.map((a) => (
          <p key={a.id} className="text-sm text-neutral-900 border-b border-neutral-100 py-1">
            #{a.numero} · <b>{a.stato}</b> · {a.descrizione}{a.inGaranzia ? "" : " (fuori garanzia)"}{a.dataIntervento ? ` · intervento ${a.dataIntervento.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}
          </p>
        ))}
        <form action={creaAssistenza} className="flex flex-wrap items-end gap-2 mt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="prodotto" placeholder="Prodotto" className={`${inp} w-40`} />
          <input name="descrizione" required placeholder="Problema segnalato" className={`${inp} flex-1 min-w-48`} />
          <select name="priorita" className={inp}><option>NORMALE</option><option>URGENTE</option><option>BASSA</option></select>
          <button className="btn-3d btn-3d-pink text-sm px-4 py-2">Apri assistenza</button>
        </form>
      </details>

      {/* TIMELINE */}
      <details id="storico" className="card-fase scroll-mt-4" style={{ "--fase": "#2563eb" } as React.CSSProperties} open={false}>
        <summary className="cursor-pointer list-none"><h2 className="mb-3">Storico</h2></summary>
        <form action={aggiungiNotaCommessa} className="flex gap-2 mb-3">
          <input type="hidden" name="id" value={c.id} />
          <input name="testo" placeholder="Aggiungi una nota…" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-dark text-sm px-4 py-2">Aggiungi</button>
        </form>
        <ul className="space-y-1.5">
          {c.eventi.map((e) => (
            <li key={e.id} className="text-sm text-neutral-900">
              <span className="text-xs text-neutral-500">{e.createdAt.toLocaleString("it-IT")}{e.utenteNome ? ` · ${e.utenteNome}` : ""} — </span>
              {e.testo}
            </li>
          ))}
        </ul>
      </details>
      <div className="mb-4"><FotoProgetto commessaId={c.id} preventivoId={c.preventivoId} /></div>
      <div id="documenti" className="scroll-mt-4">
        <Documenti entita="COMMESSA" entitaId={c.id} titolo="Documenti della commessa" />
      </div>
    </div>
  );
}
