// Albero del listino per il selettore a tendine (Famiglia Indoor/Outdoor > Gruppo > [Sottogruppo] > Modello), lo stesso
// dell'offerta: lo usano la pagina dell'offerta e la pratica (materiale da ordinare preso dal listino).
import { prisma } from "@/lib/prisma";
import type { FamigliaNodo, NodoTipologia } from "@/components/SelettoreProdotto";
import { haMisura, sottogruppoDiTipologia, labelBreveTipologia, notaInArrivo, assiSelezioneZpc, assiSelezioneUragano, assiSelezioneVerticale, assiSelezioneModelloAnte, assiSelezionePersianeBlindate, assiSelezioneKopen, assiSelezioneIsomax, assiSelezioneMinibox, assiSelezioneTapparelle, assiSelezioneWpc, assiSelezioneSeraFrangisole, assiSelezioneAccessoriTapparelle, assiSelezioneBlindati, assiSelezioneZenith, assiSelezioneRullo, assiSelezionePergola, assiSelezioneVetrata, assiSelezioneBioclimatica } from "@/lib/prodotti";

// Gruppi di tende da sole che usano un tessuto Tempotest (vedi task #210): qui la
// tendina "Optional" viene sostituita da SelettoreTessuti, una cascata a 2 livelli
// (collezione -> codice) invece dell'elenco piatto di oltre 500 codici tessuto.
export const GRUPPI_TENDE_CON_TESSUTO = [
  "TENDE A BRACCI SENZA CASSONETTO",
  "TENDE A BRACCI CON CASSONETTO",
  "TENDE A CADUTA",
  "TENDE CLASSICHE",
  "TENDE ORIZZONTALI",
  "TENDE VERANDA",
  "GIARDINO E PATIO",
  "CAPPOTTINE FISSE E MOBILI",
  "LINEA ZIP",
  "TELAI FISSI",
];

// Vetrate scorrevoli/fisse (vedi richiesta utente su Scintilla/Brillante/Fisso): raccolte
// sotto un unico gruppo sintetico "VETRATE" in tendina, con il nome del catalogo originale
// mostrato come sottogruppo (es. VETRATE > Scintilla, VETRATE > Brillante, VETRATE > Fisso),
// sullo stesso modello del wrapping gia' usato per le TENDE. "Porte vetro" non e' ancora a
// listino (nessun prezzo/dato tecnico caricato) e va aggiunto qui non appena disponibile.
export const GRUPPI_VETRATE: Record<string, string> = {
  "VETRATE SCINTILLA": "Scintilla",
  "VETRATE BRILLANTE": "Brillante",
  "VETRATE FISSO": "Fisso",
  // Porte a vetro (vetro e alluminio / tutto vetro): famiglia a parte dentro VETRATE.
  "VETRATE PORTE": "Porte a vetro",
  // Vetrate con vetrocamera di Chirenti (src/lib/listini/chirenti.ts)
  "VETRATE BOOK PRO CAM": "Book Pro Cam (a libro, vetrocamera)",
  "VETRATE SOLCO PRO CAM": "Solco Pro Cam (scorrevole, vetrocamera)",
};

// Listino Work&Service (posa/rilievo/servizi, vedi task #280): i 24 "gruppo" con cui
// sono stati caricati i ModelloProdotto WSPOSA_* sono raccolti sotto 3 macro-categorie
// sintetiche in tendina ("Posa" / "Rilievo" / "Servizi", vedi richiesta utente task #281),
// col nome originale mostrato come sottogruppo — stesso wrapping gia' usato per TENDE/VETRATE.
export const GRUPPI_WSPOSA: Record<string, { gruppo: string; sottogruppo: string }> = {
  "Rilievo Vetrate Panoramiche": { gruppo: "Rilievo", sottogruppo: "Vetrate Panoramiche" },
  "Rilievo Pergotende e Bioclimatiche": { gruppo: "Rilievo", sottogruppo: "Pergotende e Bioclimatiche" },
  "Rilievo Serramenti e affini": { gruppo: "Rilievo", sottogruppo: "Serramenti e affini" },
  "Note Trasferta Rilievi Pergole/Vetrate": { gruppo: "Rilievo", sottogruppo: "Trasferta Rilievi Pergole/Vetrate" },
  "Note Trasferta Rilievi Serramenti": { gruppo: "Rilievo", sottogruppo: "Trasferta Rilievi Serramenti" },
  "Posa in Opera Pergotende e Bioclimatiche": { gruppo: "Posa", sottogruppo: "Pergotende e Bioclimatiche" },
  "Note Posa Pergotende e Bioclimatiche": { gruppo: "Posa", sottogruppo: "Extra Posa Pergotende e Bioclimatiche" },
  "Posa in Opera Vetrate Vepa": { gruppo: "Posa", sottogruppo: "Vetrate Vepa" },
  "Complementi e Lavorazioni Extra Vetrate": { gruppo: "Posa", sottogruppo: "Complementi e Lavorazioni Extra Vetrate" },
  "Note Logistiche Vetrate": { gruppo: "Posa", sottogruppo: "Logistica Vetrate" },
  "Posa in Opera Finestre e Porte Finestre": { gruppo: "Posa", sottogruppo: "Finestre e Porte Finestre" },
  "Posa in Opera Porte Interne": { gruppo: "Posa", sottogruppo: "Porte Interne" },
  "Posa in Opera Portoncini": { gruppo: "Posa", sottogruppo: "Portoncini" },
  "Posa in Opera Porte Blindate": { gruppo: "Posa", sottogruppo: "Porte Blindate" },
  "Posa in Opera Tapparelle": { gruppo: "Posa", sottogruppo: "Tapparelle" },
  "Posa in Opera Persiane": { gruppo: "Posa", sottogruppo: "Persiane" },
  "Posa in Opera Inferriate": { gruppo: "Posa", sottogruppo: "Inferriate" },
  "Posa in Opera Zanzariere": { gruppo: "Posa", sottogruppo: "Zanzariere" },
  "Posa in Opera Pensiline": { gruppo: "Posa", sottogruppo: "Pensiline" },
  "Posa in Opera Accessori": { gruppo: "Posa", sottogruppo: "Accessori" },
  "Note Posa Serramenti": { gruppo: "Posa", sottogruppo: "Extra Posa Serramenti" },
  "Posa in Opera Tende da Sole": { gruppo: "Posa", sottogruppo: "Tende da Sole" },
  "Costi Aggiuntivi e Servizi Accessori": { gruppo: "Servizi", sottogruppo: "Costi Aggiuntivi e Servizi Accessori" },
  "Spese Magazzino": { gruppo: "Servizi", sottogruppo: "Spese Magazzino" },
};

export async function tassonomiaListino(brandId: string): Promise<FamigliaNodo[]> {
  const [tipologieMisure, modelliBrand, blindatiMisure] = await Promise.all([
    prisma.prodotto.groupBy({
      by: ["tipologia"],
      where: { brandId: brandId },
      orderBy: { tipologia: "asc" },
      _min: { larghezzaMm: true, altezzaMm: true },
      _max: { larghezzaMm: true, altezzaMm: true },
    }),
    prisma.modelloProdotto.findMany({ where: { brandId: brandId } }),
    // Portoncini Blindati: 2 righe "corner" (50x180 e 110x250, presenti su tutte e 4 le
    // tipologie) esistono solo per definire il range massimo producibile a listino, ma
    // NON sono misure standard vere e proprie (fuori da quelle il prezzo resta invariato
    // solo per convenzione tecnica, non perche' siano combinazioni realmente offerte dal
    // fornitore). Le 6 vere misure standard (senza sovrapprezzo "Fuori Misura") vanno
    // mostrate esplicitamente, altrimenti il banner min-max risulta fuorviante.
    prisma.prodotto.findMany({
      where: { brandId: brandId, tipologia: { startsWith: "BLINDATI_" } },
      select: { tipologia: true, larghezzaMm: true, altezzaMm: true },
      orderBy: [{ tipologia: "asc" }, { larghezzaMm: "asc" }, { altezzaMm: "asc" }],
    }),
  ]);
  const modelloBrandMap = new Map(modelliBrand.map((m) => [m.tipologia, m]));

  // Coordinate "corner" comuni a tutte le tipologie Blindati (50x180 e 110x250): servono
  // solo a delimitare il range massimo mostrato in banner, non sono misure standard reali.
  const angoliBlindati = new Set(["50x180", "110x250"]);
  const misureStandardBlindatiMap = new Map<string, { larghezza: number; altezza: number }[]>();
  for (const p of blindatiMisure) {
    const chiave = `${p.larghezzaMm}x${p.altezzaMm}`;
    if (angoliBlindati.has(chiave)) continue;
    if (!misureStandardBlindatiMap.has(p.tipologia)) misureStandardBlindatiMap.set(p.tipologia, []);
    misureStandardBlindatiMap.get(p.tipologia)!.push({ larghezza: p.larghezzaMm, altezza: p.altezzaMm });
  }
  const tipologieSenzaMisura = tipologieMisure
    .filter((t) => !haMisura(t._max.larghezzaMm ?? 0, t._max.altezzaMm ?? 0))
    .map((t) => t.tipologia);

  const variantiSenzaMisura = tipologieSenzaMisura.length
    ? await prisma.prodotto.findMany({
        where: { brandId: brandId, tipologia: { in: tipologieSenzaMisura } },
        select: { id: true, tipologia: true, colore: true, prezzoBase: true },
        orderBy: [{ tipologia: "asc" }, { colore: "asc" }],
      })
    : [];
  const variantiPerTipologia = new Map<string, { id: string; colore: string; prezzoBase: number }[]>();
  for (const v of variantiSenzaMisura) {
    if (!variantiPerTipologia.has(v.tipologia)) variantiPerTipologia.set(v.tipologia, []);
    variantiPerTipologia.get(v.tipologia)!.push({ id: v.id, colore: v.colore, prezzoBase: v.prezzoBase });
  }

  // raggruppa le tipologie in un albero Famiglia (Indoor/Outdoor) > Gruppo > [Sottogruppo] > Modello,
  // rispecchiando l'organizzazione dei cataloghi cartacei, per la navigazione a tendina.
  // Il livello Sottogruppo e' opzionale: serve per i cataloghi con una variante da scegliere
  // prima della tipologia vera e propria (es. Zenith: prima Uw 1,0/1,3, poi FF/F1A/ecc.).
  type VoceAlbero = { sottogruppo: string | null; nodo: NodoTipologia };
  const alberoMap = new Map<string, Map<string, VoceAlbero[]>>();
  for (const t of tipologieMisure) {
    const tip = t.tipologia;
    const m = modelloBrandMap.get(tip);
    const famiglia = m?.famiglia ?? "Altro";
    let gruppo = m?.gruppo ?? "Altro";
    const conMisura = haMisura(t._max.larghezzaMm ?? 0, t._max.altezzaMm ?? 0);
    // Per i modelli a calcolo "a formula" (es. vetrate BRILLANTE/SCINTILLA) le righe
    // Prodotto non rappresentano una vera griglia larghezza×altezza (sono solo tariffe
    // per fascia, o un'unica tariffa fissa): mostrare il loro min/max come "range di
    // produzione" sarebbe fuorviante, quindi per questi modelli il range non si mostra.
    const aFormula = m?.modalitaCalcolo && m.modalitaCalcolo !== "GRIGLIA";
    let sottogruppo = sottogruppoDiTipologia(tip);
    // Le tende (10 gruppi distinti a livello di catalogo) vengono raccolte sotto un
    // unico gruppo sintetico "TENDE" in tendina, mostrando il nome del gruppo originale
    // come sottogruppo (es. TENDE > Tende a caduta > Tende a caduta 3000 - con cavetto).
    if (GRUPPI_TENDE_CON_TESSUTO.includes(gruppo)) {
      sottogruppo = gruppo;
      gruppo = "TENDE";
    }
    // Vetrate (Scintilla/Brillante/Fisso): stesso wrapping delle tende, vedi GRUPPI_VETRATE.
    if (gruppo in GRUPPI_VETRATE) {
      sottogruppo = GRUPPI_VETRATE[gruppo];
      gruppo = "VETRATE";
    }
    // Listino Work&Service: raccoglie i 24 gruppi piatti sotto 3 macro-categorie
    // Posa/Rilievo/Servizi in tendina, vedi GRUPPI_WSPOSA sopra.
    if (gruppo in GRUPPI_WSPOSA) {
      sottogruppo = GRUPPI_WSPOSA[gruppo].sottogruppo;
      gruppo = GRUPPI_WSPOSA[gruppo].gruppo;
    }
    if (!alberoMap.has(famiglia)) alberoMap.set(famiglia, new Map());
    const perGruppo = alberoMap.get(famiglia)!;
    if (!perGruppo.has(gruppo)) perGruppo.set(gruppo, []);
    perGruppo.get(gruppo)!.push({
      sottogruppo,
      nodo: {
        value: tip,
        // labelBreveTipologia ha gia' un fallback a tip.replace(/_/g, " ") quando la
        // tipologia non ha una etichetta breve dedicata, quindi va bene chiamarla sempre
        // (serve anche fuori dai sottogruppi, es. le "linee" Hisense Fresh Master/IQ Plus).
        label: labelBreveTipologia(tip),
        // foto per le tessere della finestra «negozio» (solo percorsi/indirizzi: le foto salvate come data URI
        // peserebbero troppo nella pagina)
        ...(m?.immagineUrl && !m.immagineUrl.startsWith("data:") ? { immagine: m.immagineUrl } : {}),
        haMisura: conMisura,
        varianti: variantiPerTipologia.get(tip),
        misure:
          conMisura && !aFormula
            ? {
                larghezzaMin: t._min.larghezzaMm ?? 0,
                larghezzaMax: t._max.larghezzaMm ?? 0,
                altezzaMin: t._min.altezzaMm ?? 0,
                altezzaMax: t._max.altezzaMm ?? 0,
                standard: misureStandardBlindatiMap.get(tip),
              }
            : undefined,
        // Zanzariere P&C: assi ante/variante → rete → colore, per la selezione a 3 tendine
        // a cascata invece della lista piatta (18-54 voci per famiglia).
        assi: assiSelezioneZpc(tip) ?? assiSelezioneUragano(tip) ?? assiSelezioneVerticale(tip) ?? undefined,
        // Infissi in Acciaio: assi modello → numero ante, per la selezione a 2
        // tendine a cascata invece della lista piatta (27 voci). Persiane Blindate
        // ha ora un proprio assiPersianeBlindate piu' sotto (4 tendine), non piu'
        // questo meccanismo generico a 2 tendine.
        assiModelloAnte: assiSelezioneModelloAnte(tip) ?? undefined,
        // Persiane Blindate: assi tipo → classe → misura doghe (se presente) → numero
        // ante, al posto dell'unica tendina "modello" piatta da 17 voci che mescolava
        // stecca aperta/dogate/antone monolamiera/antone doppia lamiera — vedi
        // richiesta utente.
        assiPersianeBlindate: assiSelezionePersianeBlindate(tip) ?? undefined,
        // Kopen: assi linea -> combinazione materiali, per la selezione a 2 tendine
        // a cascata invece della lista piatta per sottogruppo (13 gruppi, 1-3 voci
        // ciascuno).
        assiKopen: assiSelezioneKopen(tip) ?? undefined,
        // Isomax (Porte interne): assi modello -> tipo apertura, per la selezione
        // a 2 tendine a cascata invece della lista piatta (fino a 20 voci per modello).
        assiIsomax: assiSelezioneIsomax(tip) ?? undefined,
        // Tende a rullo da interno: assi tessuto -> variante (meccanismo/cassonetto),
        // per la selezione a 2 tendine a cascata (1 sola per Tagli Tessuto, che non ha
        // varianti di meccanismo) invece della lista piatta (fino a 34 voci per linea).
        assiRullo: assiSelezioneRullo(tip) ?? undefined,
        // Pergole (Lucilla/Nuvola/Panarea): assi modello ->
        // installazione (a parete/isola/patio), per la selezione a 2 tendine a
        // cascata invece della lista piatta di 21 voci mischiate sotto PERGOLE.
        assiPergola: assiSelezionePergola(tip) ?? undefined,
        // Vetrate pergole (Nesos/Nubes/Ermes): assi linea -> declinazione, stesso
        // pattern di assiPergola.
        assiVetrata: assiSelezioneVetrata(tip) ?? undefined,
        // Bioclimatiche (Wawe/Solaria/Raincover/Aurora): assi linea -> installazione,
        // stesso pattern di assiPergola.
        assiBioclimatica: assiSelezioneBioclimatica(tip) ?? undefined,
        // Blindati: assi classe → numero ante → variante due ante, per la selezione
        // a 3 tendine a cascata invece della lista piatta divisa per sottogruppo.
        assiBlindati: assiSelezioneBlindati(tip) ?? undefined,
        assiZenith: assiSelezioneZenith(tip) ?? undefined,
        // Minibox: assi misura cassonetto → tipologia tapparella, per la selezione a
        // 2 tendine a cascata invece della lista piatta (fino a 69 voci per misura).
        assiMinibox: assiSelezioneMinibox(tip) ?? undefined,
        // Tapparelle in PVC e Alluminio: assi materiale → modello → colore, per la
        // selezione a 3 tendine a cascata (la tendina colore mostra anche l'aumento).
        assiTapparelle: assiSelezioneTapparelle(tip) ?? assiSelezioneWpc(tip) ?? assiSelezioneSeraFrangisole(tip) ?? undefined,
        // Tapparelle Accessori: assi categoria -> voce -> finitura, per mostrare
        // tendine a cascata invece della lista piatta (24 voci) nel sottogruppo Accessori.
        assiAccessoriTapparelle: assiSelezioneAccessoriTapparelle(tip) ?? undefined,
        // Tipologie "in arrivo" (es. Pensilina Dritta prima che arrivi il listino):
        // visibili in tendina ma non selezionabili, mostrate in rosso.
        disabilitato: notaInArrivo(tip) ?? undefined,
      },
    });
  }
  const ordineFamiglie = ["INDOOR", "OUTDOOR"];
  const tassonomia: FamigliaNodo[] = [...alberoMap.entries()]
    .sort(([a], [b]) => {
      const ia = ordineFamiglie.indexOf(a);
      const ib = ordineFamiglie.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([nome, gruppi]) => ({
      nome,
      gruppi: [...gruppi.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([gnome, voci]) => {
          const haSottogruppi = voci.some((v) => v.sottogruppo);
          if (haSottogruppi) {
            const sgMap = new Map<string, NodoTipologia[]>();
            for (const v of voci) {
              const chiave = v.sottogruppo ?? "Altro";
              if (!sgMap.has(chiave)) sgMap.set(chiave, []);
              sgMap.get(chiave)!.push(v.nodo);
            }
            return {
              nome: gnome,
              tipologie: [],
              sottogruppi: [...sgMap.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([sgnome, tipologie]) => ({
                  nome: sgnome,
                  tipologie: tipologie.sort((a, b) => a.label.localeCompare(b.label)),
                })),
            };
          }
          return {
            nome: gnome,
            tipologie: voci.map((v) => v.nodo).sort((a, b) => a.label.localeCompare(b.label)),
          };
        }),
    }));
  return tassonomia;
}
