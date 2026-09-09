// Le tipologie delle strutture da esterno (pergole, tende, ombreggianti) usano
// come unità di misura il centimetro nei listini fornitore; i serramenti (Illumia)
// usano il millimetro. altezzaMm/larghezzaMm restano i nomi dei campi a DB per
// compatibilità, ma il valore va interpretato secondo questa unità.
const TIPOLOGIE_IN_CM = ["LUCILLA_", "NUVOLA_", "PANAREA_", "COMPSFUSI_", "WAWE_", "SOLARIA_", "RAINCOVER_", "ISCHIA_", "GIARDINO_PONZA", "CORFU_", "GIARDINO94_", "STANDARD35_", "GRADINI35", "PROLUNGATA35", "STANDARD50_", "GRADINI50", "PROLUNGATA50", "VOGUE", "DELTA_K35", "DELTA_K50", "BETA1002", "BETA1003", "BARLETTA", "CUPOLA", "TENDACADUTA_", "TELAIFISSI_", "TENDABRACCI_", "TENDAORIZZ_", "TENDABRACCICASS_", "TENDAVERANDA_", "VETRATA_", "FRANGISOLE_", "VENEZIANA_", "BEACHWAVE_", "CANCELLI_", "BLINDATI_", "KOPEN_",
  // Zanzariere plissettate: il listino a mq (calcolaMqConMinimi) interpreta le misure
  // digitate come centimetri (coerente con SCINTILLA/VETRATA_), quindi anche l'etichetta
  // del campo misura deve essere "cm" — prima mancava da questo elenco e il campo veniva
  // etichettato "mm", inducendo l'inserimento di misure 10x troppo grandi e mq/minimi
  // fatturabili completamente sballati.
  "PLISSE_",
  // Zanzariere P&C (Antarex/Alba/Pratik/Libra/Scorri): listino a mq con minimi
  // fatturabili (calcolaMqConMinimi), stessa convenzione cm delle altre zanzariere.
  "ZPC_",
  // Linea Uragano (Bora/Irene, dentro Zanzariere P&C): stesso motore MQ_CON_MINIMI,
  // stessa convenzione cm.
  // Zanzariere verticali a rullo (Incasso: Casper/Comoda/Wind Incas Verticale;
  // Scorrimento: Vera/Clik-Clak/Ketty/Wind Verticale), dentro Zanzariere P&C: stesso
  // motore MQ_CON_MINIMI, stessa convenzione cm.
  "VERTINC_", "VERTSCO_",
  // Scatolati (accessorio zanzariere venduto a metro lineare): stessa convenzione cm.
  "SCATOLATO_"];

export function unitaMisura(tipologia: string): "cm" | "mm" {
  return TIPOLOGIE_IN_CM.some((p) => tipologia.startsWith(p)) ? "cm" : "mm";
}

export function formatDimensioni(tipologia: string, larghezza: number, altezza: number): string {
  return `${larghezza}×${altezza}${unitaMisura(tipologia)}`;
}

export function listinoDiTipologia(tipologia: string): string | null {
  if (tipologia.startsWith("LUCILLA_")) return "LUCILLA";
  if (tipologia.startsWith("NUVOLA_")) return "NUVOLA";
  if (tipologia.startsWith("PANAREA_")) return "PANAREA";
  if (tipologia.startsWith("WAWE_")) return "WAWE";
  if (tipologia.startsWith("SOLARIA_")) return "SOLARIA";
  if (tipologia.startsWith("RAINCOVER_")) return "RAINCOVER";
  if (tipologia.startsWith("ISCHIA_")) return "AURORA";
  if (tipologia.startsWith("GIARDINO_PONZA")) return "GIARDINO_PONZA";
  if (tipologia.startsWith("CORFU_")) return "CORFU";
  if (tipologia.startsWith("GIARDINO94_")) return "GIARDINO94";
  if (tipologia.startsWith("STANDARD35_")) return "STANDARD35";
  if (tipologia.startsWith("GRADINI35")) return "GRADINI35";
  if (tipologia.startsWith("PROLUNGATA35")) return "PROLUNGATA35";
  if (tipologia.startsWith("STANDARD50_")) return "STANDARD50";
  if (tipologia.startsWith("GRADINI50")) return "GRADINI50";
  if (tipologia.startsWith("PROLUNGATA50")) return "PROLUNGATA50";
  if (tipologia.startsWith("VOGUE")) return "VOGUE";
  if (tipologia.startsWith("DELTA_K35")) return "DELTA_K35";
  if (tipologia.startsWith("DELTA_K50")) return "DELTA_K50";
  if (tipologia.startsWith("BETA1002")) return "BETA1002";
  if (tipologia.startsWith("BETA1003")) return "BETA1003";
  if (tipologia.startsWith("BARLETTA")) return "BARLETTA";
  if (tipologia.startsWith("CUPOLA")) return "CUPOLA";
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_SENZACASS")) return "TENDACADUTA_3000CAVETTO_SENZACASS";
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_ROUND")) return "TENDACADUTA_3000CAVETTO_ROUND";
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_TONDINOROUND")) return "TENDACADUTA_3000CAVETTO_TONDINOROUND";
  if (tipologia.startsWith("TENDACADUTA_3000GUIDE")) return "TENDACADUTA_3000GUIDE";
  if (tipologia.startsWith("TENDACADUTA_3000")) return "TENDACADUTA_3000";
  if (tipologia.startsWith("TENDACADUTA_5000S")) return "TENDACADUTA_5000S";
  if (tipologia.startsWith("TENDACADUTA_7000T")) return "TENDACADUTA_7000T";
  if (tipologia.startsWith("TENDACADUTA_7000E")) return "TENDACADUTA_7000E";
  if (tipologia.startsWith("TENDACADUTA_T4")) return "TENDACADUTA_T4";
  if (tipologia.startsWith("TENDACADUTA_ORIZZONTE")) return "TENDACADUTA_ORIZZONTE";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_CRISTAL")) return "TENDACADUTA_EVOZIP125_CRISTAL";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_SCREEN")) return "TENDACADUTA_EVOZIP125_SCREEN";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_OPATEX")) return "TENDACADUTA_EVOZIP125_OPATEX";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP100_SCREEN")) return "TENDACADUTA_EVOZIP100_SCREEN";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP100_OPATEX")) return "TENDACADUTA_EVOZIP100_OPATEX";
  if (tipologia.startsWith("TELAIFISSI_ACRILICO_ORIZZ")) return "TELAIFISSI_ACRILICO_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_ACRILICO_VERT")) return "TELAIFISSI_ACRILICO_VERT";
  if (tipologia.startsWith("TELAIFISSI_PRECONTRAINT302_ORIZZ")) return "TELAIFISSI_PRECONTRAINT302_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_PRECONTRAINT302_VERT")) return "TELAIFISSI_PRECONTRAINT302_VERT";
  if (tipologia.startsWith("TELAIFISSI_CRISTAL500_ORIZZ")) return "TELAIFISSI_CRISTAL500_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_CRISTAL500_VERT")) return "TELAIFISSI_CRISTAL500_VERT";
  if (tipologia.startsWith("TELAIFISSI_VINITEX2102_ORIZZ")) return "TELAIFISSI_VINITEX2102_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_VINITEX9X9_ORIZZ")) return "TELAIFISSI_VINITEX9X9_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_SOLTIS92_ORIZZ")) return "TELAIFISSI_SOLTIS92_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_SOLTIS92_VERT")) return "TELAIFISSI_SOLTIS92_VERT";
  if (tipologia.startsWith("TELAIFISSI_POLICARBONATO")) return "TELAIFISSI_POLICARBONATO";
  if (tipologia.startsWith("TENDABRACCI_BILBAO")) return "TENDABRACCI_BILBAO";
  if (tipologia.startsWith("TENDABRACCI_MADRID")) return "TENDABRACCI_MADRID";
  if (tipologia.startsWith("TENDABRACCI_PANAMA")) return "TENDABRACCI_PANAMA";
  if (tipologia.startsWith("TENDABRACCI_SAMBASMART")) return "TENDABRACCI_SAMBASMART";
  if (tipologia.startsWith("TENDABRACCI_SAMBA")) return "TENDABRACCI_SAMBA";
  if (tipologia.startsWith("TENDABRACCI_AMERICA")) return "TENDABRACCI_AMERICA";
  if (tipologia.startsWith("TENDAORIZZ_MILLENIUM")) return "TENDAORIZZ_MILLENIUM";
  if (tipologia.startsWith("TENDAORIZZ_TENDAROLL_SENZACASSONETTO")) return "TENDAORIZZ_TENDAROLL_SENZACASSONETTO";
  if (tipologia.startsWith("TENDAORIZZ_TENDAROLL_CONCASSONETTO")) return "TENDAORIZZ_TENDAROLL_CONCASSONETTO";
  if (tipologia.startsWith("TENDABRACCICASS_CARAIBISMART")) return "TENDABRACCICASS_CARAIBISMART";
  if (tipologia.startsWith("TENDABRACCICASS_CARAIBI")) return "TENDABRACCICASS_CARAIBI";
  if (tipologia.startsWith("TENDABRACCICASS_COVER400")) return "TENDABRACCICASS_COVER400";
  if (tipologia.startsWith("TENDABRACCICASS_EUROPA")) return "TENDABRACCICASS_EUROPA";
  if (tipologia.startsWith("TENDABRACCICASS_HAWAII")) return "TENDABRACCICASS_HAWAII";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_TOP_FRANGIVENTO")) return "TENDAVERANDA_WINTERBALKON_TOP_FRANGIVENTO";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_FRANGIVENTO")) return "TENDAVERANDA_WINTERBALKON_FRANGIVENTO";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_TOP")) return "TENDAVERANDA_WINTERBALKON_TOP";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON")) return "TENDAVERANDA_WINTERBALKON";
  if (tipologia.startsWith("VETRATA_BRILLANTE")) return "VETRATA_BRILLANTE";
  if (tipologia.startsWith("VETRATA_SCINTILLA")) return "VETRATA_SCINTILLA";
  if (tipologia.startsWith("VENEZIANA_50MM")) return "VENEZIANA_50MM_FAMIGLIA";
  if (tipologia.startsWith("VENEZIANA_70MM_SCUDO")) return "VENEZIANA_70_80MM_FAMIGLIA";
  if (tipologia.startsWith("VENEZIANA_80MM")) return "VENEZIANA_70_80MM_FAMIGLIA";
  if (tipologia.startsWith("BEACHWAVE_100")) return "BEACHWAVE_MOTORIZZABILE";
  if (tipologia.startsWith("BEACHWAVE_126")) return "BEACHWAVE_MOTORIZZABILE";
  if (tipologia.startsWith("BEACHWAVE_80")) return "BEACHWAVE_80";
  // Zenith (serramenti PVC): sotto-famiglie piu' specifiche vanno controllate PRIMA
  // della generica "ZENITH_" per poter scopare optional solo a wasistas o solo a PF3A.
  if (tipologia.startsWith("ZENITH_WASISTAS_")) return "ZENITH_WASISTAS";
  if (tipologia.startsWith("ZENITH_PF3A_SOGLIA_")) return "ZENITH_PF3A_SOGLIA";
  if (tipologia.startsWith("ZENITH_PF3A_")) return "ZENITH_PF3A";
  if (tipologia.startsWith("ZENITH_")) return "ZENITH";
  // Cancelli: APRIBILE e FISSO sono tipologie distinte (vincolo calcolo MQ_CON_MINIMI,
  // che pesca un'unica riga Prodotto di riferimento per tipologia), ma condividono lo
  // stesso gruppo di optional (pannelli decorativi), quindi un solo prefisso basta.
  if (tipologia.startsWith("CANCELLI_")) return "CANCELLI";
  // Zanzariere plissettate: ogni tipo prodotto ha il proprio "listino" cosi' gli optional
  // specifici (es. GIANIN/GIANSU/CA06 solo su Apertura Centrale, aumenti percentuali solo
  // su Portapliss) si possono scopare per prodotto, mentre gli optional trasversali (rete,
  // colori profilo, sistema a incasso) restano con listino=null sul gruppo ZANZARIERE_PLISSE.
  if (tipologia.startsWith("PLISSE_XXL08_")) return "PLISSE_XXL08";
  if (tipologia.startsWith("PLISSE_08_")) return "PLISSE_08";
  if (tipologia.startsWith("PLISSE_APERTURACENTRALE_")) return "PLISSE_APERTURACENTRALE";
  if (tipologia.startsWith("PLISSE_BILATERALE08_")) return "PLISSE_BILATERALE08";
  if (tipologia.startsWith("PLISSE_DOPPIABILATERALE_")) return "PLISSE_DOPPIABILATERALE";
  if (tipologia.startsWith("PLISSE_TRIPLABILATERALE_")) return "PLISSE_TRIPLABILATERALE";
  if (tipologia.startsWith("PLISSE_PORTAPLISS_")) return "PLISSE_PORTAPLISS";
  // Blindati: CL3 e CL4 anta singola condividono lo stesso listino (fuori misura, sopraluce,
  // fianco luce, vetro, pannelli semplici sono identici tra le due classi); le due varianti
  // a due ante hanno invece tabelle proprie (sovrapprezzi "per ogni anta", pannelli con
  // prezzo differenziato per larghezza anta principale/antino).
  if (tipologia === "BLINDATI_CL3" || tipologia === "BLINDATI_CL4") return "BLINDATI_SINGOLA";
  if (tipologia.startsWith("BLINDATI_CL3_DUEANTE")) return "BLINDATI_DUEANTE";
  // Zanzariere P&C: un "listino" per famiglia (Antarex/Alba/Pratik/Libra/Scorri), così gli
  // optional/extra propri di ciascuna famiglia (es. Telaio chiuso solo su Antarex, Doppio
  // traverso per Pratik solo su Pratik) restano scoperti dalle famiglie che non li prevedono,
  // mentre gli extra davvero trasversali (es. rete Tuffscreen) sono comunque presenti una
  // volta per ciascuna famiglia interessata.
  if (tipologia.startsWith("ZPC_ANTAREX_")) return "ZPC_ANTAREX";
  if (tipologia.startsWith("ZPC_ALBA_")) return "ZPC_ALBA";
  if (tipologia.startsWith("ZPC_PRATIK_")) return "ZPC_PRATIK";
  if (tipologia.startsWith("ZPC_LIBRA_")) return "ZPC_LIBRA";
  if (tipologia.startsWith("ZPC_SCORRI_")) return "ZPC_SCORRI";
  // Linea Uragano (Bora/Irene): un "listino" per linea di modello, per scopare gli
  // extra propri di ciascuna linea (es. Bora Angolare solo su Bora, motorizzazione
  // solo su Irene 65 Square/Square Incas).
  if (tipologia.startsWith("URAGANO_BORA_")) return "URAGANO_BORA";
  if (tipologia.startsWith("URAGANO_IRENE45UP_")) return "URAGANO_IRENE45UP";
  if (tipologia.startsWith("URAGANO_IRENE45_")) return "URAGANO_IRENE45";
  if (tipologia.startsWith("URAGANO_IRENEINCAS50_")) return "URAGANO_IRENEINCAS50";
  if (tipologia.startsWith("URAGANO_IRENE65SQUAREINCAS_")) return "URAGANO_IRENE65SQUAREINCAS";
  if (tipologia.startsWith("URAGANO_IRENE65SQUARE_")) return "URAGANO_IRENE65SQUARE";
  // Zanzariere verticali a rullo (Incasso/Scorrimento): un "listino" per linea di
  // modello (21 linee totali), per scopare eventuali extra propri di una singola linea
  // (es. Catena per doppio comando solo su Ketty/Ketty Plus).
  const lineaVert = lineaVerticale(tipologia);
  if (lineaVert) return `${lineaVert.prefix}${lineaVert.linea}`;
  // Scatolati: un "listino" per formato (60x30/50x20), per scoperire l'optional
  // "Tappo per scatolato" che è specifico del formato e va bene per tutte le finiture.
  if (tipologia.startsWith("SCATOLATO_60X30_")) return "SCATOLATO_60X30";
  if (tipologia.startsWith("SCATOLATO_50X20_")) return "SCATOLATO_50X20";
  return null;
}

// Sottogruppo di selezione a due passaggi (es. Zenith: prima si sceglie la variante
// Uw/zona climatica, poi la tipologia di serramento). Ritorna null per i prodotti che
// non hanno bisogno di questo secondo livello (la stragrande maggioranza dei cataloghi).
// Zanzariere P&C (Antarex/Alba/Pratik/Libra/Scorri): ogni tipologia codifica per
// intero la combinazione che determina il prezzo — famiglia, numero ante/variante,
// tipo di rete e fascia colore — perché il motore MQ_CON_MINIMI pesca un'unica riga
// Prodotto per tipologia (senza distinguere per colore) e perché il minimo fatturabile
// (parametriCalcolo.areaMinimaM2) varia da una combinazione all'altra. Il gruppo unico
// "ZANZARIERE_PC" raccoglie tutte le famiglie sotto Indoor; il "listino" (vedi
// listinoDiTipologia) resta invece per singola famiglia, per lo scoping degli optional.
const ZPC_FAMIGLIE = ["ANTAREX", "ALBA", "PRATIK", "LIBRA", "SCORRI"] as const;

function famigliaZpc(tipologia: string): string | null {
  const senzaPrefisso = tipologia.startsWith("ZPC_") ? tipologia.slice("ZPC_".length) : tipologia;
  for (const fam of ZPC_FAMIGLIE) {
    if (senzaPrefisso.startsWith(fam + "_")) return fam;
  }
  return null;
}

const ZPC_SOTTOGRUPPI: Record<string, string> = {
  ANTAREX: "Antarex (anta battente)",
  ALBA: "Alba (anta fissa)",
  PRATIK: "Pratik (anta fissa)",
  LIBRA: "Libra (anta scorrevole)",
  SCORRI: "Scorri (anta scorrevole)",
};

const ZPC_RETE_LABEL: Record<string, string> = {
  ALL: "Rete alluminio",
  INOX: "Rete inox",
  FIBRA: "Rete fibra",
  TUFF: "Rete Tuffscreen™/PetScreen™",
};

const ZPC_COLORE_LABEL: Record<string, string> = {
  BASE: "Base/RAL/Soft",
  RAFF: "Raffaello/Ossidate/Sablè",
  LEGNO: "Legno",
};

const ZPC_PRATIK_VARIANTE_LABEL: Record<string, string> = {
  MURO: "Fissaggio a muro",
  MAGGIORATO: "Profilo maggiorato",
  MAGNETICA: "Magnetica",
  UP: "Up",
};

const ZPC_SCORRI_VARIANTE_LABEL: Record<string, string> = {
  BASE: "Scorri semplice",
  COMP2: "Con compensatore 2 lati",
  COMP34: "Con compensatore 3/4 lati",
};

// Decompone una tipologia ZPC_ nei 3 assi di scelta (ante/variante → tipo di rete →
// colore) così l'interfaccia può mostrare 3 tendine a cascata invece di una lista piatta
// di 18-54 voci (una per ogni combinazione). Per Scorri, che ha 4 assi indipendenti
// (variante compensatore, numero ante, rete, colore), i primi due vengono uniti in un
// solo asse "modello" per restare a 3 tendine come richiesto.
export type AsseSelezione = { valore: string; label: string };
export type AssiZpc = { ante: AsseSelezione; rete: AsseSelezione; colore: AsseSelezione };

export function assiSelezioneZpc(tipologia: string): AssiZpc | null {
  const fam = famigliaZpc(tipologia);
  if (!fam) return null;
  const resto = tipologia.slice(("ZPC_" + fam + "_").length);
  const parti = resto.split("_");
  const colore = parti[parti.length - 1];
  const rete = parti[parti.length - 2];
  const coloreAsse: AsseSelezione = { valore: colore, label: ZPC_COLORE_LABEL[colore] ?? colore };
  const reteAsse: AsseSelezione = { valore: rete, label: ZPC_RETE_LABEL[rete] ?? rete };

  if (fam === "PRATIK") {
    const variante = parti[0];
    return {
      ante: { valore: variante, label: ZPC_PRATIK_VARIANTE_LABEL[variante] ?? variante },
      rete: reteAsse,
      colore: coloreAsse,
    };
  }
  if (fam === "SCORRI") {
    const variante = parti[0];
    const anteToken = parti[1];
    const varianteLabel = ZPC_SCORRI_VARIANTE_LABEL[variante] ?? variante;
    return {
      ante: { valore: `${variante}_${anteToken}`, label: `${varianteLabel} — ${anteToken.replace("ANTE", " ante")}` },
      rete: reteAsse,
      colore: coloreAsse,
    };
  }
  // ANTAREX / ALBA / LIBRA: parti[0] è "NANTA" o "NANTE"
  const anteToken = parti[0];
  return {
    ante: { valore: anteToken, label: anteToken.replace("ANTA", " anta").replace("ANTE", " ante") },
    rete: reteAsse,
    colore: coloreAsse,
  };
}

// Etichetta breve leggibile per una tipologia ZPC_, es. "2 ante · Rete alluminio ·
// Base/RAL/Soft" oppure, per Pratik/Scorri che hanno una variante di modello al posto
// (o in aggiunta) del numero di ante, "Fissaggio a muro · Rete fibra · Legno".
function labelBreveZpc(tipologia: string): string {
  const fam = famigliaZpc(tipologia);
  if (!fam) return tipologia.replace(/_/g, " ");
  const resto = tipologia.slice(("ZPC_" + fam + "_").length);
  const parti = resto.split("_");
  const colore = parti[parti.length - 1];
  const rete = parti[parti.length - 2];
  const coloreLabel = ZPC_COLORE_LABEL[colore] ?? colore;
  const reteLabel = ZPC_RETE_LABEL[rete] ?? rete;

  if (fam === "PRATIK") {
    const variante = parti[0];
    const varianteLabel = ZPC_PRATIK_VARIANTE_LABEL[variante] ?? variante;
    return `${varianteLabel} · ${reteLabel} · ${coloreLabel}`;
  }
  if (fam === "SCORRI") {
    const variante = parti[0];
    const anteToken = parti[1]; // es. "2ANTE"
    const varianteLabel = ZPC_SCORRI_VARIANTE_LABEL[variante] ?? variante;
    return `${varianteLabel} · ${anteToken.replace("ANTE", " ante")} · ${reteLabel} · ${coloreLabel}`;
  }
  // ANTAREX / ALBA / LIBRA: parti[0] è "NANTA" o "NANTE"
  const anteToken = parti[0].replace("ANTA", " anta").replace("ANTE", " ante");
  return `${anteToken} · ${reteLabel} · ${coloreLabel}`;
}

// Linea Uragano (Bora/Irene): zanzariere a rullo verticale/laterale, meccanicamente
// diverse dalle famiglie ad anta (Antarex/Alba/Pratik/Libra/Scorri) ma sempre parte
// del catalogo Zanzariere P&C secondo il fornitore. Ogni tipologia codifica linea di
// modello, eventuale montaggio (verticale/laterale/laterale doppia), tipo di
// rete/telo e fascia colore — stesso vincolo di MQ_CON_MINIMI (un'unica riga Prodotto
// per tipologia, nessuna distinzione per colore) delle altre famiglie a mq.
const URAGANO_LINEE = ["BORA", "IRENE45UP", "IRENE45", "IRENEINCAS50", "IRENE65SQUAREINCAS", "IRENE65SQUARE"] as const;

function lineaUragano(tipologia: string): string | null {
  const senzaPrefisso = tipologia.startsWith("URAGANO_") ? tipologia.slice("URAGANO_".length) : tipologia;
  for (const linea of URAGANO_LINEE) {
    if (senzaPrefisso.startsWith(linea + "_")) return linea;
  }
  return null;
}

// Tutta la Linea Uragano (Bora + Irene) sta in UN SOLO sottogruppo dentro Zanzariere
// P&C: "Scorrevole laterale a molla" — il meccanismo a rullo con richiamo a molla che
// la distingue dalle famiglie ad anta (Antarex/Alba/Pratik/Libra/Scorri). La linea di
// modello (Bora/Irene 45/Irene 45 Up/Irene Incas 50/Irene 65 Square/Irene 65 Square
// Incas) diventa quindi il primo asse di scelta dentro questo sottogruppo, non un
// sottogruppo a sé — vedi assiSelezioneUragano.
const URAGANO_SOTTOGRUPPO_UNICO = "Scorrevole laterale a molla";

const URAGANO_LINEA_LABEL: Record<string, string> = {
  BORA: "Bora",
  IRENE45: "Irene 45",
  IRENE45UP: "Irene 45 Up",
  IRENEINCAS50: "Irene Incas 50",
  IRENE65SQUARE: "Irene 65 Square",
  IRENE65SQUAREINCAS: "Irene 65 Square Incas",
};

const URAGANO_BORA_VARIANTE_LABEL: Record<string, string> = {
  TOP: "Top / Top Up / Top Incas",
  TOPDOPPIA: "Top Doppia / Top Incas Doppia",
  STD: "Standard / Up / SR / Incas",
  STDDOPPIA: "Standard Doppia / Incas Doppia",
};

const URAGANO_MONT_LABEL: Record<string, string> = {
  VERT: "Verticale",
  LAT: "Laterale",
  LATDOPPIA: "Laterale doppia",
};

const URAGANO_RETE_LABEL: Record<string, string> = {
  STRONG: "Rete nera Strong / Fibra",
  STRISCE: "Rete a strisce",
  TUFF: "Rete Tuffscreen™",
  OSCUR: "Telo oscurante (Tecnic Oscura)",
  FILTR: "Telo filtrante (Line Screen 3%)",
  OPATEX: "Oscurante Opatex Pro (solo motorizzata)",
  SCREENOSC: "Screen oscurante (solo motorizzata)",
  SCREEN5500: "Screen 5500",
};

// Decompone una tipologia URAGANO_ nei 3 assi di scelta per il selettore a cascata.
// Siccome tutte le linee condividono un solo sottogruppo, il primo asse ("ante") deve
// includere anche la linea di modello (Bora/Irene 45/Irene 45 Up/...) e non solo la
// variante/montaggio, altrimenti valori come "VERT" comparirebbero identici per più
// linee diverse mescolando reti e prezzi non pertinenti. Bora non ha un vero asse
// "rete" (rete inclusa fissa), quindi il secondo asse è segnaposto a valore unico; le
// linee 65 Square non hanno un asse "montaggio" (solo verticale), quindi il primo asse
// coincide con la linea stessa.
export function assiSelezioneUragano(tipologia: string): AssiZpc | null {
  const linea = lineaUragano(tipologia);
  if (!linea) return null;
  const resto = tipologia.slice(("URAGANO_" + linea + "_").length);
  const parti = resto.split("_");
  const lineaLabel = URAGANO_LINEA_LABEL[linea] ?? linea;

  if (linea === "BORA") {
    const [variante, colore] = parti;
    return {
      ante: {
        valore: `${linea}_${variante}`,
        label: `${lineaLabel} ${URAGANO_BORA_VARIANTE_LABEL[variante] ?? variante}`,
      },
      rete: { valore: "FISSA", label: "Rete nera Strong / rete in Fibra (inclusa)" },
      colore: { valore: colore, label: ZPC_COLORE_LABEL[colore] ?? colore },
    };
  }
  if (linea === "IRENE65SQUARE" || linea === "IRENE65SQUAREINCAS") {
    const [rete, colore] = parti;
    return {
      ante: { valore: linea, label: lineaLabel },
      rete: { valore: rete, label: URAGANO_RETE_LABEL[rete] ?? rete },
      colore: { valore: colore, label: ZPC_COLORE_LABEL[colore] ?? colore },
    };
  }
  // IRENE45 / IRENE45UP / IRENEINCAS50: montaggio + rete + colore
  const [mont, rete, colore] = parti;
  return {
    ante: {
      valore: `${linea}_${mont}`,
      label: `${lineaLabel} — ${URAGANO_MONT_LABEL[mont] ?? mont}`,
    },
    rete: { valore: rete, label: URAGANO_RETE_LABEL[rete] ?? rete },
    colore: { valore: colore, label: ZPC_COLORE_LABEL[colore] ?? colore },
  };
}

// Etichetta breve leggibile per una tipologia URAGANO_ (include sempre la linea di
// modello, dato che tutte le linee condividono un solo sottogruppo).
function labelBreveUragano(tipologia: string): string {
  const linea = lineaUragano(tipologia);
  if (!linea) return tipologia.replace(/_/g, " ");
  const resto = tipologia.slice(("URAGANO_" + linea + "_").length);
  const parti = resto.split("_");
  const lineaLabel = URAGANO_LINEA_LABEL[linea] ?? linea;

  if (linea === "BORA") {
    const [variante, colore] = parti;
    return `${lineaLabel} ${URAGANO_BORA_VARIANTE_LABEL[variante] ?? variante} · ${ZPC_COLORE_LABEL[colore] ?? colore}`;
  }
  if (linea === "IRENE65SQUARE" || linea === "IRENE65SQUAREINCAS") {
    const [rete, colore] = parti;
    return `${lineaLabel} · ${URAGANO_RETE_LABEL[rete] ?? rete} · ${ZPC_COLORE_LABEL[colore] ?? colore}`;
  }
  const [mont, rete, colore] = parti;
  return `${lineaLabel} ${URAGANO_MONT_LABEL[mont] ?? mont} · ${URAGANO_RETE_LABEL[rete] ?? rete} · ${ZPC_COLORE_LABEL[colore] ?? colore}`;
}

// Zanzariere verticali a rullo (dentro Zanzariere P&C, come Uragano), in due
// sottogruppi distinti per meccanismo di montaggio: "Incasso verticale" (Casper,
// Comoda, Wind Incas Verticale — cassonetto incassato nel vano) e "Scorrimento
// verticale" (Vera, Clik-Clak, Ketty, Wind Verticale — cassonetto a vista con guide
// esterne). A differenza di Uragano, ogni linea di modello (21 in totale) è già
// completa in sé — non ha un'ulteriore variante di montaggio — quindi la tipologia
// ha sempre e solo 3 parti dopo il prefisso: LINEA_TESSUTO_COLORE.
const VERTICALE_PREFISSI = ["VERTINC_", "VERTSCO_"] as const;

const VERTICALE_SOTTOGRUPPI: Record<string, string> = {
  VERTINC_: "Incasso verticale",
  VERTSCO_: "Scorrimento verticale",
};

const VERTICALE_LINEE: Record<string, string> = {
  // Incasso verticale
  CASPERTOP50: "Casper Top 50",
  CASPERSTD: "Casper 50 Vert. / Casper 45 / Casper 2 / Casper 3",
  CASPERPLUS50CATENA: "Casper Plus 50 Catena",
  CASPER50CATENA: "Casper 50 Catena",
  COMODASTD: "Comoda 50 Verticale",
  COMODASMART: "Comoda 50 Verticale Smart",
  WINDINCASSTD: "Wind 42 Incas / 45 Incas Verticale",
  WINDINCASSMART: "Wind 42 Incas Smart",
  // Scorrimento verticale
  VERATOP: "Vera Top 45/55 - 40/50",
  VERASTD: "Vera 45/55 - Vera Basic 40/45/50/55",
  VERATELESCOPICA: "Vera Telescopica 40/50 - 45/55",
  CLIKCLAK: "Clik-Clak",
  KETTYSTD: "Ketty 50/55",
  KETTYPLUS: "Ketty Plus 50/55",
  WINDSTD: "Wind 32/42/42 Tel./Simply/45",
  WINDMOLLACATENA: "Wind 42 Molla/Catena",
  WINDCRICCHETTO: "Wind Cricchetto (32-42-42 telesc.)",
  WINDSMART: "Wind Smart (42)",
  WINDFAST: "Wind Fast (42)",
  WINDUP: "Wind Up (45) — solo applicazione frontale",
  WINDUPCRICCHETTO: "Wind Up Cricchetto (45) — solo applicazione frontale",
};

const VERTICALE_TESSUTO_LABEL: Record<string, string> = {
  FIBRA: "Rete in fibra",
  STRISCE: "Rete a strisce",
  OSCURANTE: "Telo oscurante (Tecnic Oscura)",
  FILTRANTE: "Telo filtrante (Line Screen 3%)",
};

function lineaVerticale(tipologia: string): { prefix: string; linea: string } | null {
  for (const prefix of VERTICALE_PREFISSI) {
    if (!tipologia.startsWith(prefix)) continue;
    const resto = tipologia.slice(prefix.length);
    for (const linea of Object.keys(VERTICALE_LINEE)) {
      if (resto.startsWith(linea + "_")) return { prefix, linea };
    }
  }
  return null;
}

// Decompone una tipologia VERTINC_/VERTSCO_ nei 3 assi di scelta: la linea di
// modello fa direttamente da "ante" (ogni linea è già un modello completo), il tipo
// di tessuto (rete in fibra/a strisce/telo oscurante/filtrante) da "rete", la fascia
// colore da "colore" — stessa convenzione ZPC_COLORE_LABEL delle altre zanzariere P&C.
export function assiSelezioneVerticale(tipologia: string): AssiZpc | null {
  const trovata = lineaVerticale(tipologia);
  if (!trovata) return null;
  const { prefix, linea } = trovata;
  const resto = tipologia.slice((prefix + linea + "_").length);
  const [tessuto, colore] = resto.split("_");
  return {
    ante: { valore: `${prefix}${linea}`, label: VERTICALE_LINEE[linea] ?? linea },
    rete: { valore: tessuto, label: VERTICALE_TESSUTO_LABEL[tessuto] ?? tessuto },
    colore: { valore: colore, label: ZPC_COLORE_LABEL[colore] ?? colore },
  };
}

function labelBreveVerticale(tipologia: string): string {
  const assi = assiSelezioneVerticale(tipologia);
  if (!assi) return tipologia.replace(/_/g, " ");
  return `${assi.ante.label} · ${assi.rete.label} · ${assi.colore.label}`;
}

const PLISSE_SOTTOGRUPPI: Record<string, string> = {
  "08": "Plisse 08",
  XXL08: "XXL Plisse 08",
  APERTURACENTRALE: "Apertura Centrale (04 o 08)",
  BILATERALE08: "Bilaterale 08",
  DOPPIABILATERALE: "Doppia Bilaterale",
  TRIPLABILATERALE: "Tripla Bilaterale",
  PORTAPLISS: "Porta a Soffietto in Tessuto (Portapliss)",
};

const LAMBORGHINI_SOTTOGRUPPI: Record<string, string> = {
  SOLARIS_MINI_7: "Addolcitori d'acqua",
  SOLARIS_TAUROSOFT: "Addolcitori d'acqua",
  SOLARIS_DOUBLE_SOFT: "Addolcitori d'acqua",
  SOLARIS_MICRO: "Addolcitori d'acqua",
  SOLARIS_ECO_FVT: "Addolcitori d'acqua",
  SOLARIS_ECO_GREEN_SVT: "Addolcitori d'acqua",
  SOLARIS_DOUBLE_SVT_N: "Addolcitori d'acqua",
  SOLARIS_DOUBLE_PLUS_SVT_N: "Addolcitori d'acqua",
  SOLARIS_BASE: "Filtri meccanici autopulenti",
  SOLARIS_INOX_NET_PLUS: "Filtri meccanici autopulenti",
  SOLARIS_STOPPER_PLUS: "Filtri meccanici autopulenti",
  SOLARIS_DOSACOMPACT: "Dosatori e filtri dosatori",
  SOLARIS_DOSAFLU: "Dosatori e filtri dosatori",
  SOLARIS_DOSAPLUS: "Dosatori e filtri dosatori",
  SOLARIS_DOSAFIL_BIG: "Dosatori e filtri dosatori",
  SOLARIS_DEFENDER: "Defangatori, separatori e disareatori",
  SOLARIS_PRO2_BOX: "Defangatori, separatori e disareatori",
  SOLARIS_BIG_MAGNETO: "Defangatori, separatori e disareatori",
  SOLARIS_MAXIMAG: "Defangatori, separatori e disareatori",
  SOLARIS_SDV_C: "Defangatori, separatori e disareatori",
  SOLARIS_PRODOTTI_CHIMICI: "Prodotti chimici",
  SOLARIS_SENSE_005: "Filtrazione acqua potabile",
  SOLARIS_OSMOSENSE: "Filtrazione acqua potabile",
  SOLARIS_WATERBOX: "Filtrazione acqua potabile",
  SOLARIS_ALHENA_TECH_45_H: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_MODULO_TECH_H: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_TORO_W: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_TITAN: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_CLOVER: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_PREX_H_3_COND_65_1000: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_MEGAPREX_N_N: "Caldaie e generatori a condensazione alta potenza",
  SOLARIS_SATELLITE_COMANDI_EVOLUTO: "Termoregolazione e gestione cascata generatori",
  SOLARIS_SATELLITE_COMANDI_TERMOSTATICO: "Termoregolazione e gestione cascata generatori",
  SOLARIS_THETA_GENERATORI: "Termoregolazione e gestione cascata generatori",
  SOLARIS_COLLETTORE_INAIL: "Componenti idraulici per centrali termiche",
  SOLARIS_SCAMBIATORI_DI_CALORE_START: "Componenti idraulici per centrali termiche",
  SOLARIS_SEPARATORI_IDRAULICI: "Componenti idraulici per centrali termiche",
  SOLARIS_NEUTRALIZZATORI: "Componenti idraulici per centrali termiche",
  SOLARIS_IDOLA_LIFE_M: "Pompe di calore Idola",
  SOLARIS_IDOLA_LIFE_M_26T_35T: "Pompe di calore Idola",
  SOLARIS_IDOLA_M_3_2: "Pompe di calore Idola",
  SOLARIS_IDOLA_S_3_2: "Pompe di calore Idola",
  SOLARIS_IDOLA_ST_3_2: "Pompe di calore Idola",
  SOLARIS_IDOLA_S_IN_3_2: "Pompe di calore Idola",
  SOLARIS_IDOLA_SW_T_3_2: "Pompe di calore Idola",
  SOLARIS_IDOLA_FT_R290: "Unità interne idroniche Idola",
  SOLARIS_IDOLA_FT_R32: "Unità interne idroniche Idola",
  SOLARIS_LFI_1P_35_40: "Pompe di calore aria-acqua Lfi/Lfa",
  SOLARIS_LFA_1P_50_100: "Pompe di calore aria-acqua Lfi/Lfa",
  SOLARIS_SOLEXTECH_NAT: "Collettori e kit solari",
  SOLARIS_KIT_MONOBLOCCO: "Collettori e kit solari",
  SOLARIS_SOLEXTECH_V: "Collettori e kit solari",
  SOLARIS_COLONNA_SOLARE: "Collettori e kit solari",
  SOLARIS_IDRO: "Collettori e kit solari",
  SOLARIS_VASO_DI_ESPANSIONE: "Componenti e accessori solari",
  SOLARIS_SONDA_SOLARE_PT_1000: "Componenti e accessori solari",
  SOLARIS_SONDA_BOLLITORE_NTC: "Componenti e accessori solari",
  SOLARIS_FLUIDO_SOLARE_PROSUN: "Componenti e accessori solari",
  SOLARIS_MISCELATORE_TERMOSTATICO: "Componenti e accessori solari",
};


export function sottogruppoDiTipologia(tipologia: string): string | null {
  if (LAMBORGHINI_SOTTOGRUPPI[tipologia]) return LAMBORGHINI_SOTTOGRUPPI[tipologia];
  if (tipologia.startsWith("ZENITH_")) {
    if (tipologia.endsWith("_UKW13")) return "Zenith Uw 1,3 — zona climatica E (vetrocamera doppio)";
    if (tipologia.endsWith("_UKW10")) return "Zenith Uw 1,0 — zona climatica F (vetrocamera triplo)";
  }
  if (tipologia.startsWith("PLISSE_")) {
    const codice = tipologia.slice("PLISSE_".length).replace(/_(STD|STDPLUS|MICH|FL)$/, "");
    return PLISSE_SOTTOGRUPPI[codice] ?? null;
  }
  if (tipologia.startsWith("ZPC_")) {
    const fam = famigliaZpc(tipologia);
    return fam ? ZPC_SOTTOGRUPPI[fam] ?? null : null;
  }
  if (tipologia.startsWith("URAGANO_")) {
    return lineaUragano(tipologia) ? URAGANO_SOTTOGRUPPO_UNICO : null;
  }
  const vert = lineaVerticale(tipologia);
  if (vert) return VERTICALE_SOTTOGRUPPI[vert.prefix] ?? null;
  if (tipologia.startsWith("SCATOLATO_60X30_")) return "Scatolato 60x30 (ZAP010)";
  if (tipologia.startsWith("SCATOLATO_50X20_")) return "Scatolato 50x20 (ZAP070)";
  if (tipologia.startsWith("KOPEN_")) {
    const codice = tipologia.split("_")[1];
    return KOPEN_SOTTOGRUPPI[codice] ?? null;
  }
  return null;
}

const ZENITH_DESCRIZIONI: Record<string, string> = {
  FF: "Specchiatura fissa (FF)",
  WASISTAS: "Wasistas",
  F1A: "Finestra 1 anta (F1A)",
  F2A: "Finestra 2 ante (F2A)",
  F3A: "Finestra 3 ante (F3A)",
  PF1A: "Portafinestra 1 anta (PF1A)",
  PF2A: "Portafinestra 2 ante (PF2A)",
  PF2A_SOGLIA: "Portafinestra 2 ante con soglia (PF2A Soglia)",
  PF3A: "Portafinestra 3 ante (PF3A)",
  PF3A_SOGLIA: "Portafinestra 3 ante con soglia (PF3A Soglia)",
  TRASLANTE: "Traslante",
};

// Etichetta breve da mostrare dentro un sottogruppo (senza ripetere marca/variante,
// gia' indicate dal sottogruppo stesso). Se la tipologia non ha un sottogruppo, si
// continua a usare l'etichetta "grezza" (tipologia con gli underscore sostituiti da spazi).
const PLISSE_FINITURE: Record<string, string> = {
  STD: "Standard",
  STDPLUS: "Standard Plus",
  MICH: "Michelangelo",
  FL: "Finto Legno",
};

const SCATOLATO_FINITURA_LABEL: Record<string, string> = {
  BASE: "Base",
  VERNICIATO: "Verniciato",
  RAFFAELLO: "Raffaello",
  SABLE: "Sablé",
  LEGNO: "Legno tinte",
};

const KOPEN_SOTTOGRUPPI: Record<string, string> = {
  LISCIO: "Modello liscio",
  FRESATURE: "Modelli con fresature",
  BUGNATI: "Modelli bugnati ciechi",
  INSERTI: "Lisci con inserti",
  STYLE: "Style modelli con inserti",
  VITRUM: "Vitrum — modelli fresati con vetro",
  VITRUMINS: "Vitrum — modelli fresati con vetro e inserti",
  VITRUMBUG: "Vitrum — modelli bugnati con vetro e inserti",
  FRAME: "Frame bugnati con vetro e inglesina decorata oro esterno",
  LUMIERE: "Lumiere",
  CLASSIC: "Classic bugnati con cornice riportata",
  EFFECT: "Linea Effect — modelli multicolor",
  EFFECTVETRO: "Effect multicolor con vetro e inserti",
};

const KOPEN_LABELS: Record<string, string> = {
  KOPEN_LISCIO_ALU_LISCIO_INT: "ALU / liscio interno",
  KOPEN_LISCIO_ALU_ALU: "ALU / ALU",
  KOPEN_FRESATURE_ALU_EST_LEGNO_INT: "ALU fresato est. / legno liscio int.",
  KOPEN_FRESATURE_ALU_EST_ALU_INT: "ALU fresato est. / ALU liscio int.",
  KOPEN_FRESATURE_ALU_EST_INT: "ALU fresato est. e int. (stesso disegno)",
  KOPEN_BUGNATI_ALU_EST_LEGNO_INT: "ALU bugnato est. / legno liscio int.",
  KOPEN_BUGNATI_ALU_EST_ALU_INT: "ALU bugnato est. / ALU liscio int.",
  KOPEN_BUGNATI_ALU_EST_INT: "ALU bugnato est. e int. (stesso disegno)",
  KOPEN_INSERTI_ALU_EST_LEGNO_INT: "ALU fresato c/inserti est. / legno liscio int.",
  KOPEN_INSERTI_ALU_EST_ALU_INT: "ALU fresato c/inserti est. / ALU liscio int.",
  KOPEN_INSERTI_ALU_EST_INT: "ALU fresato c/inserti est. e int. (stesso disegno)",
  KOPEN_STYLE_ALLUMINIO: "Alluminio liscio interno ed esterno",
  KOPEN_VITRUM_ALU_EST_ALLUM_INT: "ALU fresato est. / alluminio liscio int.",
  KOPEN_VITRUM_ALU_EST_INT: "ALU fresato est. e int. (stesso disegno)",
  KOPEN_VITRUMINS_ALU_EST_ALLUM_INT: "ALU fresato c/inserti est. / alluminio liscio int.",
  KOPEN_VITRUMINS_ALU_EST_INT: "ALU fresato c/inserti est. e int. (stesso disegno)",
  KOPEN_VITRUMBUG_ALU_EST_ALLUM_INT: "ALU bugnato est. / alluminio liscio int.",
  KOPEN_VITRUMBUG_ALU_EST_INT: "ALU bugnato est. e int. (stesso disegno)",
  KOPEN_FRAME_ALU_EST_ALLUM_INT: "ALU bugnato est. / alluminio liscio int.",
  KOPEN_FRAME_ALU_EST_INT: "ALU bugnato est. e int. (stesso disegno)",
  KOPEN_LUMIERE_ALLUMINIO: "Alluminio interno / esterno",
  KOPEN_CLASSIC_ALU_EST_LEGNO_INT: "ALU bugnato c/cornice est. / legno liscio int.",
  KOPEN_CLASSIC_ALU_EST_ALU_INT: "ALU bugnato c/cornice est. / ALU liscio int.",
  KOPEN_EFFECT_ALU_EST_LEGNO_INT: "ALU effect est. / legno liscio int.",
  KOPEN_EFFECT_ALU_EST_ALU_INT: "ALU effect est. / ALU liscio int.",
  KOPEN_EFFECT_ALU_EST_INT: "ALU effect est. e int. (stesso disegno)",
  KOPEN_EFFECTVETRO_ALU_EST_ALU_INT: "ALU effect est. / ALU liscio int.",
  KOPEN_EFFECTVETRO_ALU_EST_INT: "ALU effect est. e int. (stesso disegno, stessi colori)",
};

const BLINDATI_LABELS: Record<string, string> = {
  BLINDATI_CL3: "Classe 3 - Anta Singola",
  BLINDATI_CL4: "Classe 4 - Anta Singola",
  BLINDATI_CL3_DUEANTE_STD: "Classe 3 - Due Ante (80/85/90 + 30/35/40/45)",
  BLINDATI_CL3_DUEANTE_SIMMETRICA: "Classe 3 - Due Ante Simmetriche (55/60/65 + 55/60/65)",
};

const HISENSE_LABELS: Record<string, string> = {
  SOLARIS_HISENSE_FRESH_MASTER: "Fresh Master",
  SOLARIS_HISENSE_IQ_PLUS: "IQ Plus",
  SOLARIS_HISENSE_UNITA_ESTERNE_MULTISPLIT: "Unità esterne multisplit",
};

export function labelBreveTipologia(tipologia: string): string {
  if (tipologia.startsWith("ZENITH_")) {
    const senzaPrefisso = tipologia.slice("ZENITH_".length);
    const base = senzaPrefisso.replace(/_UKW1[03]$/, "");
    return ZENITH_DESCRIZIONI[base] ?? base.replace(/_/g, " ");
  }
  if (tipologia.startsWith("PLISSE_")) {
    const match = tipologia.match(/_(STD|STDPLUS|MICH|FL)$/);
    if (match) return PLISSE_FINITURE[match[1]] ?? match[1];
  }
  if (HISENSE_LABELS[tipologia]) return HISENSE_LABELS[tipologia];
  if (BLINDATI_LABELS[tipologia]) return BLINDATI_LABELS[tipologia];
  if (KOPEN_LABELS[tipologia]) return KOPEN_LABELS[tipologia];
  if (tipologia.startsWith("ZPC_")) return labelBreveZpc(tipologia);
  if (tipologia.startsWith("URAGANO_")) return labelBreveUragano(tipologia);
  if (lineaVerticale(tipologia)) return labelBreveVerticale(tipologia);
  if (tipologia.startsWith("SCATOLATO_")) {
    const match = tipologia.match(/_(BASE|VERNICIATO|RAFFAELLO|SABLE|LEGNO)$/);
    if (match) return SCATOLATO_FINITURA_LABEL[match[1]] ?? match[1];
  }
  return tipologia.replace(/_/g, " ");
}

// Estrae la finitura/profilo (STD/STDPLUS/MICH/FL) dalla tipologia di una zanzariera
// plissettata, per filtrare gli optional "Colore profilo" e "Sistema ad incasso" che
// hanno una riga per ciascuna finitura: senza questo filtro comparirebbero sempre
// tutte e 4 le varianti (Standard, Standard Plus, Michelangelo, Finto Legno) invece
// di solo quella coerente con la finitura già scelta scegliendo il modello.
export function finituraDiTipologia(tipologia: string): string | null {
  if (tipologia.startsWith("PLISSE_")) {
    const match = tipologia.match(/_(STD|STDPLUS|MICH|FL)$/);
    if (match) return match[1];
  }
  // Zanzariere P&C: la fascia colore (BASE/RAFF/LEGNO) in coda alla tipologia gioca lo
  // stesso ruolo della finitura plissettata, per scoperire correttamente gli optional
  // con prezzo differenziato per fascia colore (es. Telaio chiuso, Doppio traverso).
  if (tipologia.startsWith("ZPC_")) {
    const match = tipologia.match(/_(BASE|RAFF|LEGNO)$/);
    if (match) return match[1];
  }
  // Linea Uragano: stessa convenzione fascia colore in coda alla tipologia.
  if (tipologia.startsWith("URAGANO_")) {
    const match = tipologia.match(/_(BASE|RAFF|LEGNO)$/);
    if (match) return match[1];
  }
  // Zanzariere verticali a rullo: stessa convenzione fascia colore in coda alla tipologia.
  if (tipologia.startsWith("VERTINC_") || tipologia.startsWith("VERTSCO_")) {
    const match = tipologia.match(/_(BASE|RAFF|LEGNO)$/);
    if (match) return match[1];
  }
  return null;
}

export function etichetteDimensioni(tipologia: string): { larghezza: string; altezza: string } {
  if (tipologia.startsWith("SCATOLATO_")) return { larghezza: "Lunghezza", altezza: "Non utilizzato — inserire 1" };
  if (tipologia.startsWith("KOPEN_") || tipologia.startsWith("BLINDATI_")) return { larghezza: "Larghezza", altezza: "Altezza" };
  if (unitaMisura(tipologia) === "cm") return { larghezza: "Larghezza", altezza: "Sporgenza" };
  return { larghezza: "Larghezza", altezza: "Altezza" };
}

export function haMisura(larghezza: number, altezza: number): boolean {
  return larghezza > 0 || altezza > 0;
}
