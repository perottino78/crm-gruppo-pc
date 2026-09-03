// Le tipologie delle strutture da esterno (pergole, tende, ombreggianti) usano
// come unità di misura il centimetro nei listini fornitore; i serramenti (Illumia)
// usano il millimetro. altezzaMm/larghezzaMm restano i nomi dei campi a DB per
// compatibilità, ma il valore va interpretato secondo questa unità.
const TIPOLOGIE_IN_CM = ["LUCILLA_", "NUVOLA_", "PANAREA_", "COMPSFUSI_", "WAWE_", "SOLARIA_", "RAINCOVER_", "ISCHIA_", "GIARDINO_PONZA", "CORFU_", "GIARDINO94_", "STANDARD35_", "GRADINI35", "PROLUNGATA35", "STANDARD50_", "GRADINI50", "PROLUNGATA50", "VOGUE", "DELTA_K35", "DELTA_K50", "BETA1002", "BETA1003", "BARLETTA", "CUPOLA", "TENDACADUTA_", "TELAIFISSI_", "TENDABRACCI_", "TENDAORIZZ_", "TENDABRACCICASS_", "TENDAVERANDA_", "VETRATA_", "FRANGISOLE_", "VENEZIANA_", "BEACHWAVE_", "CANCELLI_", "BLINDATI_"];

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
  return null;
}

// Sottogruppo di selezione a due passaggi (es. Zenith: prima si sceglie la variante
// Uw/zona climatica, poi la tipologia di serramento). Ritorna null per i prodotti che
// non hanno bisogno di questo secondo livello (la stragrande maggioranza dei cataloghi).
const PLISSE_SOTTOGRUPPI: Record<string, string> = {
  "08": "Plisse 08",
  XXL08: "XXL Plisse 08",
  APERTURACENTRALE: "Apertura Centrale (04 o 08)",
  BILATERALE08: "Bilaterale 08",
  DOPPIABILATERALE: "Doppia Bilaterale",
  TRIPLABILATERALE: "Tripla Bilaterale",
  PORTAPLISS: "Porta a Soffietto in Tessuto (Portapliss)",
};

export function sottogruppoDiTipologia(tipologia: string): string | null {
  if (tipologia.startsWith("ZENITH_")) {
    if (tipologia.endsWith("_UKW13")) return "Zenith Uw 1,3 — zona climatica E (vetrocamera doppio)";
    if (tipologia.endsWith("_UKW10")) return "Zenith Uw 1,0 — zona climatica F (vetrocamera triplo)";
  }
  if (tipologia.startsWith("PLISSE_")) {
    const codice = tipologia.slice("PLISSE_".length).replace(/_(STD|STDPLUS|MICH|FL)$/, "");
    return PLISSE_SOTTOGRUPPI[codice] ?? null;
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

const BLINDATI_LABELS: Record<string, string> = {
  BLINDATI_CL3: "Classe 3 - Anta Singola",
  BLINDATI_CL4: "Classe 4 - Anta Singola",
  BLINDATI_CL3_DUEANTE_STD: "Classe 3 - Due Ante (80/85/90 + 30/35/40/45)",
  BLINDATI_CL3_DUEANTE_SIMMETRICA: "Classe 3 - Due Ante Simmetriche (55/60/65 + 55/60/65)",
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
  if (BLINDATI_LABELS[tipologia]) return BLINDATI_LABELS[tipologia];
  return tipologia.replace(/_/g, " ");
}

export function etichetteDimensioni(tipologia: string): { larghezza: string; altezza: string } {
  if (unitaMisura(tipologia) === "cm") return { larghezza: "Larghezza", altezza: "Sporgenza" };
  return { larghezza: "Larghezza", altezza: "Altezza" };
}

export function haMisura(larghezza: number, altezza: number): boolean {
  return larghezza > 0 || altezza > 0;
}
