// Serramenti FIDRA 1.2 (alluminio con cuore in PVC, Uw ≈ 1,3): listino UKW 1.3 – 2025, prezzi già al cliente finale
// (coefficiente 2,2 già applicato nel file del fornitore). Le griglie larghezza × altezza (mm) sono in
// prisma/seed-data/fidra_prodotti.json (estratte dal file Excel; le celle «*» = primo prezzo disponibile).
// Modulo puro: lo usano la rotta api/admin/seed-fidra e la pagina dell'offerta.

export const PREFISSO_FIDRA = "FIDRA_";
export const SOTTOGRUPPO_FIDRA = "Alluminio — Fidra";

export const TIPOLOGIE_FIDRA: Record<string, { label: string; foto: string; descrizione: string; portafinestra: boolean }> = {
  FIDRA_F1A: { label: "Finestra 1 anta", foto: "f1a.png", portafinestra: false, descrizione: "Finestra 1 anta (anta-ribalta)" },
  FIDRA_F2A: { label: "Finestra 2 ante", foto: "f2a.png", portafinestra: false, descrizione: "Finestra 2 ante (anta-ribalta + anta)" },
  FIDRA_F3A: { label: "Finestra 3 ante", foto: "f3a.png", portafinestra: false, descrizione: "Finestra 3 ante" },
  FIDRA_FF: { label: "Fisso (specchiatura fissa)", foto: "ff.png", portafinestra: false, descrizione: "Specchiatura fissa" },
  FIDRA_W: { label: "Wasistas", foto: "w.png", portafinestra: false, descrizione: "Specchiatura a wasistas (a scrocco o con maniglia)" },
  FIDRA_PF1A: { label: "Portafinestra 1 anta", foto: "pf1a.png", portafinestra: true, descrizione: "Portafinestra 1 anta, tutto telaio" },
  FIDRA_PF1A_SOGLIA: { label: "Portafinestra 1 anta — soglia ribassata", foto: "pf1a-soglia.png", portafinestra: true, descrizione: "Portafinestra 1 anta con soglia ribassata" },
  FIDRA_PF2A: { label: "Portafinestra 2 ante", foto: "pf2a.png", portafinestra: true, descrizione: "Portafinestra 2 ante, tutto telaio" },
  FIDRA_PF2A_SOGLIA: { label: "Portafinestra 2 ante — soglia ribassata", foto: "pf2a-soglia.png", portafinestra: true, descrizione: "Portafinestra 2 ante con soglia ribassata" },
  FIDRA_PF3A: { label: "Portafinestra 3 ante", foto: "pf3a.png", portafinestra: true, descrizione: "Portafinestra 3 ante, tutto telaio" },
  FIDRA_PF3A_SOGLIA: { label: "Portafinestra 3 ante — soglia ribassata", foto: "pf3a-soglia.png", portafinestra: true, descrizione: "Portafinestra 3 ante con soglia ribassata" },
  FIDRA_TRASLANTE: { label: "Traslante (ribalta e scorri su fisso)", foto: "traslante.png", portafinestra: true, descrizione: "Scorrevole traslante: anta a ribalta che scorre su fisso" },
};

export const labelFidra = (tipologia: string) => TIPOLOGIE_FIDRA[tipologia]?.label ?? null;

/** Listini degli optional per la tipologia: «FIDRA» comune + finestre/portefinestre + specifici. */
export function listiniFidra(tipologia: string): string[] {
  const t = TIPOLOGIE_FIDRA[tipologia];
  if (!t) return [];
  return ["FIDRA", t.portafinestra ? "FIDRA_PF" : "FIDRA_F", ...(tipologia === "FIDRA_W" ? ["FIDRA_WAS"] : [])];
}

export const GUIDA_FIDRA =
  "Prezzo dalla griglia del listino (misura uguale o subito superiore), già al cliente finale, colori standard compresi. " +
  "Meno di 3 pezzi nell'ordine (fissi: meno di 2): aggiungi il minimo di produzione. Misure speciali: chiedere fattibilità tecnica.";

export const CATALOGHI_FIDRA = [
  { nome: "Brochure Fidra", url: "/cataloghi/fidra/Brochure-Fidra.pdf" },
  { nome: "Dispositivi Matter", url: "/cataloghi/fidra/Dispositivi-Matter.pdf" },
];

const COLORI_STANDARD = ["Bianco massa", "Rovere gold", "Noce gold", "Bianco frassinato", "Rovere sbiancato", "Douglas", "Verde (Vert)"];
const COLORI_FUORI_STANDARD = ["Rovere grigio", "Oregon", "Acajou", "Chêne moyen", "Douglas", "Chêne naturel", "Valnus terra", "Valnus",
  "Vert foncé (verde scuro)", "Rouge foncé (rosso scuro)", "Palissandro", "Gris (grigio)", "Anthracite (antracite)", "Bleu d'acier (blu acciaio)"];

export type OptionalFidra = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; unita: string | null; listino: string };

export function optionalFidra(): OptionalFidra[] {
  const o = (categoria: string, nome: string, valore: number, listino = "FIDRA", tipoPrezzo: "FISSO" | "PERCENTUALE" = "FISSO", unita: string | null = null): OptionalFidra =>
    ({ categoria, nome, tipoPrezzo, valore, unita, listino });
  return [
    ...COLORI_STANDARD.map((c) => o("Colore", `${c} (colore standard)`, 0)),
    ...COLORI_FUORI_STANDARD.map((c) => o("Colore", `${c} — fuori standard, pellicola su un lato`, 30, "FIDRA", "PERCENTUALE")),
    o("Colore", "Pellicole fuori standard diverse sui due lati (interno/esterno)", 100, "FIDRA", "PERCENTUALE"),
    o("Vetri", "Vetro STC (a vetro)", 150, "FIDRA", "FISSO", "vetro"),
    o("Vetri", "Vetro satinato (ad anta)", 90, "FIDRA_F", "FISSO", "anta"),
    o("Vetri", "Vetro satinato (ad anta)", 150, "FIDRA_PF", "FISSO", "anta"),
    o("Maniglie e ferramenta", "Maniglia passante con cilindro europeo", 500),
    o("Maniglie e ferramenta", "Motoriduttore a catena (apertura motorizzata wasistas)", 350, "FIDRA_WAS"),
    o("Traversi e pannelli", "Traverso aggiuntivo orizzontale (cad.)", 90),
    o("Traversi e pannelli", "Traverso aggiuntivo verticale (cad.)", 120),
    o("Traversi e pannelli", "Pannello fisso aggiuntivo (cad.)", 100, "FIDRA_PF"),
    o("Misure e lavorazioni", "Oltre le misure di listino: ogni 10 cm in più (L o H)", 300),
    o("Misure e lavorazioni", "Serramento curvo o sagomato", 40, "FIDRA", "PERCENTUALE"),
    o("Misure e lavorazioni", "Minimo di produzione (ordine con meno di 3 pezzi; fissi meno di 2)", 450),
    o("Servizi al contratto", "Autoscala dal 3° piano in su", 500),
    o("Servizi al contratto", "Autoscala dal 7° piano in su", 800),
    o("Servizi al contratto", "Autoscala su suolo pubblico senza parcheggio interno (in più)", 300),
    o("Servizi al contratto", "Pratica ENEA (gestione e presentazione)", 350),
    o("Servizi al contratto", "Smaltimento cartongesso (al mq)", 300, "FIDRA", "FISSO", "mq"),
  ];
}
