// Serramenti in PVC OPTIMA 70 (5 camere, profondità 70 mm, Uf 1,3 W/m²K — «Optima 1.3»): listino P&C 2026 dal file
// «OPTIMA70_PREMIUM_FINALE.xlsx». Le griglie larghezza × altezza (mm) dei fogli sono già il prezzo di listino
// (base × coefficiente 1,35 del file) e stanno in prisma/seed-data/optima_prodotti.json (estratte con
// scripts/listini/estrai_optima.py; «*» = primo prezzo disponibile). Optional e accessori presi dalle note dei fogli
// e dal foglio «ACCESSORI». Modulo puro: lo usano la rotta api/admin/seed-optima e la pagina dell'offerta.

export const PREFISSO_OPTIMA = "OPTIMA_";
export const SOTTOGRUPPO_OPTIMA = "PVC — Optima 70";
export const COEFFICIENTE_OPTIMA = 1.35;

// Disegni delle tipologie: gli stessi schemi usati per Fidra (stesse aperture).
export const TIPOLOGIE_OPTIMA: Record<string, { label: string; foto: string; descrizione: string; portafinestra: boolean }> = {
  OPTIMA_F1A: { label: "Finestra 1 anta", foto: "f1a.png", portafinestra: false, descrizione: "Finestra 1 anta (anta-ribalta)" },
  OPTIMA_F2A: { label: "Finestra 2 ante", foto: "f2a.png", portafinestra: false, descrizione: "Finestra 2 ante (anta-ribalta + anta)" },
  OPTIMA_F3A: { label: "Finestra 3 ante", foto: "f3a.png", portafinestra: false, descrizione: "Finestra 3 ante" },
  OPTIMA_FF: { label: "Fisso (specchiatura fissa)", foto: "ff.png", portafinestra: false, descrizione: "Specchiatura fissa" },
  OPTIMA_W: { label: "Wasistas", foto: "w.png", portafinestra: false, descrizione: "Specchiatura a wasistas" },
  OPTIMA_PF1A: { label: "Portafinestra 1 anta", foto: "pf1a.png", portafinestra: true, descrizione: "Portafinestra 1 anta" },
  OPTIMA_PF1A_SOGLIA: { label: "Portafinestra 1 anta — soglia ribassata", foto: "pf1a-soglia.png", portafinestra: true, descrizione: "Portafinestra 1 anta con soglia ribassata" },
  OPTIMA_PF2A: { label: "Portafinestra 2 ante", foto: "pf2a.png", portafinestra: true, descrizione: "Portafinestra 2 ante" },
  OPTIMA_PF2A_SOGLIA: { label: "Portafinestra 2 ante — soglia ribassata", foto: "pf2a-soglia.png", portafinestra: true, descrizione: "Portafinestra 2 ante con soglia ribassata" },
  OPTIMA_PF3A: { label: "Portafinestra 3 ante", foto: "pf3a.png", portafinestra: true, descrizione: "Portafinestra 3 ante" },
  OPTIMA_PF3A_SOGLIA: { label: "Portafinestra 3 ante — soglia ribassata", foto: "pf3a-soglia.png", portafinestra: true, descrizione: "Portafinestra 3 ante con soglia ribassata" },
  OPTIMA_TRASLANTE: { label: "Traslante (ribalta e scorri su fisso)", foto: "traslante.png", portafinestra: true, descrizione: "Scorrevole traslante: anta a ribalta che scorre su fisso" },
};

export const labelOptima = (tipologia: string) => {
  const t = TIPOLOGIE_OPTIMA[tipologia];
  return t ? `Optima 70 — ${t.label}` : null;
};

/** Listini degli optional per la tipologia: «OPTIMA» comune + finestre/portefinestre + wasistas. */
export function listiniOptima(tipologia: string): string[] {
  const t = TIPOLOGIE_OPTIMA[tipologia];
  if (!t) return [];
  return ["OPTIMA", t.portafinestra ? "OPTIMA_PF" : "OPTIMA_F", ...(tipologia === "OPTIMA_W" ? ["OPTIMA_WAS"] : [])];
}

export const GUIDA_OPTIMA =
  "Prezzo dalla griglia del listino Optima 70 (misura uguale o subito superiore), bianco massa compreso; tutte le pellicole +20%. " +
  "Meno di 3 pezzi nell'ordine (fissi: meno di 2): aggiungi il minimo di produzione. Pezzi grandi da trasportare: verificare il trasporto (+350 €). " +
  "Misure speciali: chiedere fattibilità tecnica.";

export const CATALOGHI_OPTIMA = [{ nome: "Scheda tecnica Optima 70", url: "/cataloghi/optima/Optima70-scheda-tecnica.pdf" }];

/** Descrizione tecnica breve per il cliente, stampata nell'offerta sotto l'elenco puntato (richiesta di Ugo, dalla scheda tecnica v3). */
export const DESCRIZIONE_CLIENTE_OPTIMA =
  "Serramento in PVC Optima 70: profilo a 5 camere isolanti (classe A, EN 12608), profondità 70 mm, rinforzi in acciaio zincato, " +
  "doppia guarnizione EPDM. Trasmittanza telaio Uf 1,3 W/m²K (finestra Uw ≈ 1,1 con vetro basso emissivo), isolamento acustico fino a 45 dB. " +
  "Aria classe 4, acqua 9A, vento C4. Marcatura CE EN 14351-1, colore garantito 10 anni.";

/** Pellicole del listino (tutte +20% sul bianco massa). */
export const PELLICOLE_OPTIMA = [
  "Rovere gold (AP 23)", "Noce gold (AP 27)", "Rovere grigio (AP 94)", "Bianco frassinato (AP 44)", "Oregon (AP 15)",
  "Rovere sbiancato (AP 75)", "Rovere sbiancato (AP 50)", "Acajou (AP 05)", "Chêne moyen (AP 06)", "Douglas (AP 11)",
  "Vert — verde (AP 43)", "Chêne naturel (AP 01)", "Valnus terra (AP 28)", "Valnus (AP 29)", "Vert foncé — verde scuro (AP 30)",
  "Rouge foncé — rosso scuro (A 32)", "Palissandro (AP 33)", "Gris — grigio (AP 34)", "Anthracite — antracite (AP 40)", "Bleu d'acier — blu acciaio (AP 41)",
];

export type OptionalOptima = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; unita: string | null; listino: string };

export function optionalOptima(): OptionalOptima[] {
  const o = (categoria: string, nome: string, valore: number, listino = "OPTIMA", tipoPrezzo: "FISSO" | "PERCENTUALE" = "FISSO", unita: string | null = null): OptionalOptima =>
    ({ categoria, nome, tipoPrezzo, valore, unita, listino });
  return [
    o("Colore", "Bianco massa", 0),
    ...PELLICOLE_OPTIMA.map((c) => o("Colore", `${c} — pellicola`, 20, "OPTIMA", "PERCENTUALE")),
    o("Colore", "Pellicola fuori standard su un lato", 30, "OPTIMA", "PERCENTUALE"),
    o("Colore", "Pellicole fuori standard diverse sui due lati (interno/esterno)", 100, "OPTIMA", "PERCENTUALE"),
    o("Vetri", "Vetro STC (a vetro)", 150, "OPTIMA", "FISSO", "vetro"),
    o("Vetri", "Vetro satinato (ad anta)", 90, "OPTIMA_F", "FISSO", "anta"),
    o("Vetri", "Vetro satinato (ad anta)", 150, "OPTIMA_PF", "FISSO", "anta"),
    o("Maniglie e ferramenta", "Maniglia passante con cilindro europeo", 500), // su tutti i serramenti, come Fidra (richiesta di Ugo)
    o("Maniglie e ferramenta", "Motore per wasistas (bianco o nero, con pulsante; corrente a carico del cliente)", 350, "OPTIMA_WAS"),
    o("Maniglie e ferramenta", "Antifurto con cavo da 3 m (non scontabile)", 45),
    o("Traversi e pannelli", "Traverso aggiuntivo laterale (cad.)", 90),
    o("Traversi e pannelli", "Traverso aggiuntivo verticale (cad.)", 120),
    o("Traversi e pannelli", "Pannello fisso aggiuntivo (cad.)", 100, "OPTIMA_PF"),
    o("Traversi e pannelli", "Foro per passagatto (il cliente fornisce il passagatto, o traverso + pannello fisso)", 150),
    o("Misure e lavorazioni", "Oltre le misure di listino: ogni 10 cm in più (L o H)", 300),
    o("Misure e lavorazioni", "Minimo di produzione (ordine con meno di 3 pezzi; fissi meno di 2)", 450),
    o("Misure e lavorazioni", "Trasporto pezzi fuori sagoma (celle rosa del listino)", 350),
    o("Servizi al contratto", "Autoscala dal 3° piano in su", 700),
    o("Servizi al contratto", "Autoscala dal 7° piano in su", 900),
    o("Servizi al contratto", "Autoscala su suolo pubblico senza parcheggio interno (in più)", 500),
    o("Servizi al contratto", "Pratica ENEA (gestione e presentazione)", 350),
    o("Servizi al contratto", "Smaltimento cartongesso (al mq)", 300, "OPTIMA", "FISSO", "mq"),
    o("Servizi al contratto", "Smontaggio e smaltimento veranda esistente (a corpo)", 500),
  ];
}
