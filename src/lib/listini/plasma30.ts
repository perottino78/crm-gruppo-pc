// Serramenti in PVC PLASMA 30 (telaio e anta 74 mm, Uf 1,0 W/m²K): listino P&C 2025 dai file «PLASMA 30 UKW 1.3 - 2025»
// (doppio vetro, coefficiente 2,7 del file, tipologie PLASMA30_*) e «PLASMA 30 UKW 1.0 - 2025» (triplo vetro, coefficiente 3,
// tipologie PLASMA30TV_*). Le griglie larghezza × altezza (mm) dei fogli sono già il prezzo al cliente e stanno in
// prisma/seed-data/plasma30_prodotti.json (scripts/listini/estrai_plasma30.py; «*» = primo prezzo disponibile).
// Optional sulla falsa riga dell'Optima 70 (richiesta di Ugo), con le regole dei colori del listino Plasma 30.
// Modulo puro: lo usano la rotta api/admin/seed-plasma30, la pagina dell'offerta e le schede tecniche.

export const PREFISSO_PLASMA30 = "PLASMA30_";
export const PREFISSO_PLASMA30_TV = "PLASMA30TV_";
export const SOTTOGRUPPO_PLASMA30 = "PVC — Plasma 30";
export const SOTTOGRUPPO_PLASMA30_TV = "PVC — Plasma 30 triplo vetro";

/** Tipologia del listino Plasma 30 (doppio o triplo vetro)? «PLASMA30_» non comprende «PLASMA30TV_». */
export const ePlasma30 = (tipologia: string) => tipologia.startsWith(PREFISSO_PLASMA30) || tipologia.startsWith(PREFISSO_PLASMA30_TV);
export const triploVetro = (tipologia: string) => tipologia.startsWith(PREFISSO_PLASMA30_TV);

// Aperture (disegni = quelli di Fidra/Optima). Le chiavi senza prefisso valgono per le due versioni.
const APERTURE: Record<string, { label: string; foto: string; descrizione: string; portafinestra: boolean }> = {
  F1A: { label: "Finestra 1 anta", foto: "f1a.png", portafinestra: false, descrizione: "Finestra 1 anta (anta-ribalta)" },
  F2A: { label: "Finestra 2 ante", foto: "f2a.png", portafinestra: false, descrizione: "Finestra 2 ante (anta-ribalta + anta)" },
  F3A: { label: "Finestra 3 ante", foto: "f3a.png", portafinestra: false, descrizione: "Finestra 3 ante" },
  FF: { label: "Fisso (specchiatura fissa)", foto: "ff.png", portafinestra: false, descrizione: "Specchiatura fissa" },
  W: { label: "Wasistas", foto: "w.png", portafinestra: false, descrizione: "Specchiatura a wasistas (a scrocco o con maniglia)" },
  PF1A: { label: "Portafinestra 1 anta", foto: "pf1a.png", portafinestra: true, descrizione: "Portafinestra 1 anta, tutto telaio" },
  PF1A_SOGLIA: { label: "Portafinestra 1 anta — soglia ribassata", foto: "pf1a-soglia.png", portafinestra: true, descrizione: "Portafinestra 1 anta con soglia ribassata" },
  PF2A: { label: "Portafinestra 2 ante", foto: "pf2a.png", portafinestra: true, descrizione: "Portafinestra 2 ante" },
  PF2A_SOGLIA: { label: "Portafinestra 2 ante — soglia ribassata", foto: "pf2a-soglia.png", portafinestra: true, descrizione: "Portafinestra 2 ante con soglia ribassata" },
  PF3A: { label: "Portafinestra 3 ante", foto: "pf3a.png", portafinestra: true, descrizione: "Portafinestra 3 ante" },
  PF3A_SOGLIA: { label: "Portafinestra 3 ante — soglia ribassata", foto: "pf3a-soglia.png", portafinestra: true, descrizione: "Portafinestra 3 ante con soglia ribassata" },
  TRASLANTE: { label: "Traslante (ribalta e scorri su fisso)", foto: "traslante.png", portafinestra: true, descrizione: "Scorrevole traslante: anta a ribalta che scorre su fisso" },
};

export type TipologiaPlasma30 = { label: string; foto: string; descrizione: string; portafinestra: boolean; triplo: boolean; apertura: string };

/** Le 24 tipologie: 12 doppio vetro (PLASMA30_) + 12 triplo vetro (PLASMA30TV_). */
export const TIPOLOGIE_PLASMA30: Record<string, TipologiaPlasma30> = Object.fromEntries(
  [false, true].flatMap((triplo) =>
    Object.entries(APERTURE).map(([k, a]) => [`${triplo ? PREFISSO_PLASMA30_TV : PREFISSO_PLASMA30}${k}`, { ...a, triplo, apertura: k }]),
  ),
);

export const labelPlasma30 = (tipologia: string) => {
  const t = TIPOLOGIE_PLASMA30[tipologia];
  return t ? `Plasma 30${t.triplo ? " triplo vetro" : ""} — ${t.label}` : null;
};

/** Listini degli optional per la tipologia: «PLASMA30» comune + finestre/portefinestre + wasistas + fuori misura. */
export function listiniPlasma30(tipologia: string): string[] {
  const t = TIPOLOGIE_PLASMA30[tipologia];
  if (!t) return [];
  return [
    "PLASMA30",
    t.portafinestra ? "PLASMA30_PF" : "PLASMA30_F",
    ...(t.apertura === "W" ? ["PLASMA30_WAS"] : []),
    // fuori misura: 300 € ogni 10 cm; nel triplo vetro la portafinestra 3 ante con soglia oltre 2400 mm costa 400 €
    t.triplo && t.apertura === "PF3A_SOGLIA" ? "PLASMA30_FUORI400" : "PLASMA30_FUORI300",
  ];
}

export const GUIDA_PLASMA30 =
  "Prezzo dalla griglia del listino Plasma 30 (misura uguale o subito superiore), bianco massa compreso; avorio +5%; pellicole standard " +
  "+15% su un lato o +20% sui due lati uguali, fuori standard +30% su un lato, diverse sui due lati +100% (fuori standard sui due lati: chiedere). " +
  "Minimo di produzione: doppio vetro meno di 3 pezzi (fissi meno di 2), triplo vetro meno di 2 pezzi. Misure speciali: chiedere fattibilità tecnica.";

export const CATALOGHI_PLASMA30 = [{ nome: "Scheda tecnica Plasma 30", url: "/cataloghi/plasma30/Plasma30-scheda-tecnica.pdf" }];

const DESCRIZIONE_BASE =
  "profilo squadrato con telaio e anta di soli 74 mm, 6 camere nel telaio e 5 nell'anta, 3 guarnizioni di battuta, saldatura K-Perfect. " +
  "Trasmittanza telaio Uf 1,0 W/m²K, isolamento acustico Rw 34-42 dB; tenuta all'acqua classe 9A, resistenza al vento C4, permeabilità all'aria classe 4. " +
  "Nodo centrale asimmetrico slim da 100 mm (fino al 30% di luce in più), PVC rigenerato e riciclabile al 100%.";

/** Descrizioni tecniche brevi per il cliente, stampate nell'offerta sotto l'elenco puntato (dalla scheda tecnica Plasma 30). */
export const DESCRIZIONE_CLIENTE_PLASMA30 = `Serramento in PVC Plasma 30 con vetrocamera doppia: ${DESCRIZIONE_BASE}`;
export const DESCRIZIONE_CLIENTE_PLASMA30_TV = `Serramento in PVC Plasma 30 con triplo vetro: ${DESCRIZIONE_BASE}`;

/** Pellicole standard (+15% su un lato, +20% sui due lati uguali). */
export const PELLICOLE_STANDARD_PLASMA30 = [
  "Rovere gold (AP 23)", "Noce gold (AP 27)", "Bianco frassinato (AP 44)", "Rovere sbiancato (AP 75)", "Rovere sbiancato (AP 50)",
  "Douglas (AP 11)", "Vert — verde (AP 43)",
];
/** Pellicole fuori standard (+30% su un lato). */
export const PELLICOLE_FUORI_STANDARD_PLASMA30 = [
  "Rovere grigio (AP 94)", "Oregon (AP 15)", "Acajou (AP 05)", "Chêne moyen (AP 06)", "Chêne naturel (AP 01)", "Valnus terra (AP 28)",
  "Valnus (AP 29)", "Vert foncé — verde scuro (AP 30)", "Rouge foncé — rosso scuro (A 32)", "Palissandro (AP 33)", "Gris — grigio (AP 34)",
  "Anthracite — antracite (AP 40)", "Bleu d'acier — blu acciaio (AP 41)",
];

export type OptionalPlasma30 = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; unita: string | null; listino: string };

export function optionalPlasma30(): OptionalPlasma30[] {
  const o = (categoria: string, nome: string, valore: number, listino = "PLASMA30", tipoPrezzo: "FISSO" | "PERCENTUALE" = "FISSO", unita: string | null = null): OptionalPlasma30 =>
    ({ categoria, nome, tipoPrezzo, valore, unita, listino });
  return [
    o("Colore", "Bianco massa", 0),
    o("Colore", "Avorio (in massa)", 5, "PLASMA30", "PERCENTUALE"),
    ...PELLICOLE_STANDARD_PLASMA30.flatMap((c) => [
      o("Colore", `${c} — pellicola su un lato`, 15, "PLASMA30", "PERCENTUALE"),
      o("Colore", `${c} — pellicola sui due lati uguali`, 20, "PLASMA30", "PERCENTUALE"),
    ]),
    ...PELLICOLE_FUORI_STANDARD_PLASMA30.map((c) => o("Colore", `${c} — pellicola fuori standard su un lato`, 30, "PLASMA30", "PERCENTUALE")),
    o("Colore", "Pellicole diverse sui due lati (interno/esterno)", 100, "PLASMA30", "PERCENTUALE"),
    o("Vetri", "Vetro STC (a vetro)", 150, "PLASMA30", "FISSO", "vetro"),
    o("Vetri", "Vetro satinato (ad anta)", 90, "PLASMA30_F", "FISSO", "anta"),
    o("Vetri", "Vetro satinato (ad anta)", 150, "PLASMA30_PF", "FISSO", "anta"),
    o("Maniglie e ferramenta", "Maniglia passante con cilindro europeo", 500),
    o("Maniglie e ferramenta", "Motore per wasistas (bianco o nero, con pulsante; corrente a carico del cliente)", 350, "PLASMA30_WAS"),
    o("Maniglie e ferramenta", "Antifurto con cavo da 3 m (non scontabile)", 45),
    o("Traversi e pannelli", "Traverso aggiuntivo laterale (cad.)", 90),
    o("Traversi e pannelli", "Traverso aggiuntivo verticale (cad.)", 120),
    o("Traversi e pannelli", "Pannello fisso aggiuntivo (cad.)", 100, "PLASMA30_PF"),
    o("Traversi e pannelli", "Foro per passagatto (il cliente fornisce il passagatto, o traverso + pannello fisso)", 150),
    o("Misure e lavorazioni", "Oltre le misure di listino: ogni 10 cm in più (L o H)", 300, "PLASMA30_FUORI300"),
    o("Misure e lavorazioni", "Oltre 2400 mm: ogni 10 cm in più", 400, "PLASMA30_FUORI400"),
    o("Misure e lavorazioni", "Serramento curvo o sagomato", 40, "PLASMA30", "PERCENTUALE"),
    o("Misure e lavorazioni", "Minimo di produzione (doppio vetro: meno di 3 pezzi, fissi meno di 2; triplo vetro: meno di 2 pezzi)", 450),
    o("Misure e lavorazioni", "Trasporto pezzi fuori sagoma", 350),
    o("Servizi al contratto", "Autoscala dal 3° piano in su", 700),
    o("Servizi al contratto", "Autoscala dal 7° piano in su", 900),
    o("Servizi al contratto", "Autoscala su suolo pubblico senza parcheggio interno (in più)", 500),
    o("Servizi al contratto", "Pratica ENEA (gestione e presentazione)", 350),
    o("Servizi al contratto", "Smaltimento cartongesso (al mq)", 300, "PLASMA30", "FISSO", "mq"),
    o("Servizi al contratto", "Smontaggio e smaltimento veranda esistente (a corpo)", 500),
  ];
}
