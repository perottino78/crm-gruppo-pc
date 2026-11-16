// Listino Solaris portato da BConsole (anagrafica articoli «export_pro.xls» del 16/11/2026, richiesta di Ugo): fotovoltaico
// (impianti completi, pannelli, inverter e batterie Stealth Energy, quadri, cavi e strutture, posa e pratiche) e pompe di calore /
// caldaie / bollitori AMG. Ogni articolo è un modello del listino con la sua foto (famiglia SOLARIS) e un solo prezzo di vendita,
// quello di BConsole; il costo resta per il guadagno (fornitore, codice e sconto d'acquisto del modello).
// I dati sono in prisma/seed-data/solaris_bconsole.json (preparati con scratchpad export_pro/prepara.py: esclusi i climatizzatori,
// già a listino, le voci a 0 €, le copie e un prezzo palesemente sbagliato). Modulo puro.
import dati from "../../../prisma/seed-data/solaris_bconsole.json";

export type VoceSolarisBC = {
  tipologia: string; tipo: string; codice: string; nome: string; descrizione: string;
  vendita: number; acquisto: number; um: string; fornitore: string; codiceFornitore: string; immagine: string | null;
};

export const VOCI_SOLARIS_BC = (dati as { voci: VoceSolarisBC[] }).voci;
export const PREFISSO_SOLARIS_BC = "SOLBC_";
export const FAMIGLIA_SOLARIS = "SOLARIS";

export const GRUPPO_FOTOVOLTAICO = "FOTOVOLTAICO";
export const GRUPPO_PDC_AMG = "POMPE DI CALORE E CALDAIE AMG";

const TIPI: Record<string, { gruppo: string; sottogruppo: string }> = {
  FV_KIT: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Impianti completi (kit)" },
  FV_PANNELLI: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Pannelli" },
  FV_INVERTER: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Inverter" },
  FV_BATTERIE: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Batterie e controller (BMS)" },
  FV_QUADRI: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Quadri e protezioni" },
  FV_MONTAGGIO: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Strutture, cavi e connettori" },
  FV_POSA: { gruppo: GRUPPO_FOTOVOLTAICO, sottogruppo: "Posa e pratiche" },
  PDC_POMPE: { gruppo: GRUPPO_PDC_AMG, sottogruppo: "Pompe di calore" },
  PDC_CALDAIE: { gruppo: GRUPPO_PDC_AMG, sottogruppo: "Caldaie ibride e a condensazione" },
  PDC_ACS: { gruppo: GRUPPO_PDC_AMG, sottogruppo: "Bollitori, ACS e puffer" },
  PDC_ACCESSORI: { gruppo: GRUPPO_PDC_AMG, sottogruppo: "Accessori e installazione" },
};

const perTipologia = new Map(VOCI_SOLARIS_BC.map((v) => [v.tipologia, v]));
export const voceSolarisBC = (tipologia: string) => perTipologia.get(tipologia) ?? null;

/** Gruppo e sottogruppo del listino (dal tipo nella tipologia: SOLBC_<FV|PDC>_<TIPO>_<codice>). */
export function posizioneSolarisBC(tipologia: string): { gruppo: string; sottogruppo: string } | null {
  if (!tipologia.startsWith(PREFISSO_SOLARIS_BC)) return null;
  const tipo = Object.keys(TIPI).find((t) => tipologia.startsWith(`${PREFISSO_SOLARIS_BC}${t}_`));
  return tipo ? TIPI[tipo] : null;
}

// refusi del gestionale: nel listino e in stampa i nomi escono corretti
const REFUSI: [RegExp, string][] = [
  [/FOTOVOLTAIVO/g, "FOTOVOLTAICO"], [/\bBLECK\b/g, "BLACK"], [/\bSTEATH\b/g, "STEALTH"], [/INSTALLAZIUONE/g, "INSTALLAZIONE"],
  [/PèRATICA/g, "PRATICA"], [/IDRALICI/g, "IDRAULICI"], [/CONDIZIONARORE/g, "CONDIZIONATORE"], [/SOLARISCON/g, "SOLARIS CON"],
];
export function nomePulito(nome: string): string {
  let n = nome.replace(/\s+/g, " ").trim();
  for (const [re, giusto] of REFUSI) n = n.replace(re, giusto);
  return n;
}

/** Nome del modello nel listino e nell'offerta. */
export function labelSolarisBC(tipologia: string): string | null {
  const v = voceSolarisBC(tipologia);
  return v ? nomePulito(v.nome) : null;
}

/** Unica variante del modello: dice anche l'unità (al metro, a kW) perché la quantità dell'offerta è in quell'unità. */
export function varianteSolarisBC(um: string): string {
  return um === "m" ? "Al metro" : um === "kW" ? "Al kW installato" : "Standard";
}

/** Sconto d'acquisto sul prezzo di vendita che dà il costo di BConsole (vuoto se il costo non c'è). */
export function scontoAcquistoBC(v: { vendita: number; acquisto: number }): number | null {
  if (!(v.acquisto > 0) || !(v.vendita > 0) || v.acquisto >= v.vendita) return null;
  return Math.round((1 - v.acquisto / v.vendita) * 10000) / 100;
}

export function descrizioneSolarisBC(v: VoceSolarisBC): string {
  const d = v.descrizione && v.descrizione !== v.nome ? nomePulito(v.descrizione) : "";
  return [nomePulito(v.nome), d, `Codice: ${v.codice}`].filter(Boolean).join(" — ");
}

/** Pratiche: fuori dalla base delle provvigioni, come gli altri «servizi e pratiche». */
export const inProvvigioneSolarisBC = (v: VoceSolarisBC) => !/PRATICHE/i.test(v.nome);

/**
 * Prezzi da BConsole per i prodotti Stealth di Solaris Studio (nome del catalogo in src/lib/solaris/stealth.ts → vendita/costo).
 * Si scrivono solo dove il prezzo è ancora a 0 (mai sopra un prezzo inserito a mano). Il modulo da 2,76 kWh in BConsole è
 * «SP HE10227 Battery 2.76 kwh»; SP-HEHV27 in BConsole è il controller (BMS), venduto a parte.
 */
export const PREZZI_STEALTH_BC: Record<string, { vendita: number; costo: number; codice: string }> = {
  "Stealth ST-INV-T10.0 10 kW trifase (ibrido)": { vendita: 3920, costo: 1225, codice: "INV/10KWH.ST-INV-T10.0" },
  "Stealth ST-INV-S5.0 5 kW (ibrido)": { vendita: 750, costo: 0, codice: "ST-INV S5.0" },
  "Stealth ST-INV-S6.0 6 kW (ibrido)": { vendita: 675, costo: 0, codice: "ST-INV-S6.0" },
  "Stealth SP-HEHV27 2,76 kWh": { vendita: 1353, costo: 483, codice: "SP HE10227" },
};

/**
 * Pannelli di BConsole per Solaris Studio (misure in metri: w = larghezza, h = altezza del modulo in verticale).
 * VDS 370 W: misure dalla descrizione di BConsole (1980 × 1000 × 35 mm). VDS 460 W: BConsole non ha le misure, qui quelle
 * della stessa famiglia 144 mezze celle da 166 mm (≈ 2095 × 1039 mm, scheda VDS-S144/M6H): «da confermare» con la scheda tecnica.
 */
export const PANNELLI_STUDIO_BC = [
  {
    nome: "VDS 370 W Red (monocristallino, cornice RAL 8017)", potenzaW: 370, w: 1.0, h: 1.98, spessoreMm: 35, vendita: 480, costo: 303, codice: "VE372PVMR370W", daConfermare: false,
    specs: { celle: "monocristallino 5 busbar, vetro 4 mm, cornice RAL 8017", dim: "1980 × 1000 × 35 mm", cert: "RAEE (contributo incluso)" },
  },
  {
    // misure e peso dalla scheda VDS-S144/M6H-BG 430–450 W (stessa famiglia 144 mezze celle da 166 mm); il 460 W Total Black non è citato nella scheda
    nome: "VDS 460 W Total Black", potenzaW: 460, w: 1.039, h: 2.095, spessoreMm: 30, vendita: 380, costo: 99.9, codice: "VDS-S144/M6H", daConfermare: true,
    specs: { celle: "monocristallino 166 mm, 144 mezze celle (6 × 24), tecnologia multi busbar", dim: "2095 × 1039 × 30 mm", peso: "28,5 kg", gar_prod: 12, gar_rend: 25, cert: "VDS Power GmbH (Germania) · fuoco classe A" },
  },
];
