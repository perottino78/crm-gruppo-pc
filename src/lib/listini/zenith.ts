// Serramenti in PVC ZENITH (Uw 1,3 zona E vetrocamera doppio, Uw 1,0 zona F vetrocamera triplo): le griglie restano quelle di
// prisma/seed-data/zenith_prodotti.json; qui gli optional rifatti «come l'Optima» (richiesta di Ugo 16/11/2026): colore esterno e
// interno separati con i costi, vetri, accessori insieme, lavorazioni trapezoidali e curve. Regole del listino Zenith: bianco massa
// compreso, colori fuori standard e pellicole +20%; PF3A: pellicola fuori standard su un lato +30%, diverse sui due lati +100%.
// Modulo puro: lo usano la pagina dell'offerta, la rotta seed-zenith e l'allineamento automatico degli optional.
import { PELLICOLE_OPTIMA } from "./optima";
import { formeSpeciali, vetriSpeciali, type VoceOptional } from "./serramenti-comuni";

export const PREFISSO_ZENITH = "ZENITH_";

const PORTEFINESTRE = ["PF1A", "PF2A", "PF2A_SOGLIA", "PF3A", "PF3A_SOGLIA"];

/** Modello e vetro della tipologia: ZENITH_<modello>_UKW13|UKW10. */
export function partiZenith(tipologia: string): { modello: string; triplo: boolean } | null {
  const m = tipologia.match(/^ZENITH_(.+)_UKW1([03])$/);
  return m ? { modello: m[1], triplo: m[2] === "0" } : null;
}

/** Listini degli optional per la tipologia: «ZENITH» comune + finestre/portefinestre + wasistas + PF3A + doppio/triplo vetro. */
export function listiniZenith(tipologia: string): string[] {
  const p = partiZenith(tipologia);
  if (!p) return [];
  return [
    "ZENITH",
    PORTEFINESTRE.includes(p.modello) ? "ZENITH_PF" : "ZENITH_F",
    p.triplo ? "ZENITH_TRIPLO" : "ZENITH_DOPPIO",
    ...(p.modello === "WASISTAS" ? ["ZENITH_WAS"] : []),
    ...(p.modello.startsWith("PF3A") ? ["ZENITH_PF3A"] : []),
  ];
}

export const CATALOGHI_ZENITH = [{ nome: "Scheda tecnica Zenith 72", url: "/cataloghi/zenith/Zenith72-scheda-tecnica.pdf" }];

/** Descrizione tecnica breve per il cliente, stampata nell'offerta sotto l'elenco puntato (dalla scheda tecnica Zenith 72). */
export const DESCRIZIONE_CLIENTE_ZENITH =
  "Serramento in PVC Zenith 72: PVC rigido antiurto, profilo da 70 mm a 6 camere con rinforzi in acciaio, doppia guarnizione in EPDM. " +
  "Vetrocamera stratificato di sicurezza isolante 3+3 basso emissivo / 18 gas argon / 3+3, trasmittanza del profilo Uf 1,3 W/m²K. " +
  "Soglia ribassata a taglio termico calpestabile, ferramenta con trattamento anticorrosivo, pellicolatura a caldo. Consegna indicativa 60 giorni lavorativi.";

export const GUIDA_ZENITH =
  "Prezzo dalla griglia del listino Zenith (misura uguale o subito superiore), bianco massa compreso; colori fuori standard e pellicole +20%. " +
  "Vetro stratificato di sicurezza 3+3 / 18 argon / 3+3 già di serie. Scegli colore esterno e interno (servono anche al rilievo), il vetro e gli accessori. Forme trapezoidali o curve: +40%. " +
  "Vetri speciali: prezzi stimati, da confermare con il fornitore.";

export function optionalZenith(): VoceOptional[] {
  const o = (categoria: string, nome: string, valore: number, listino = "ZENITH", tipoPrezzo: "FISSO" | "PERCENTUALE" = "FISSO", unita: string | null = null): VoceOptional =>
    ({ categoria, nome, tipoPrezzo, valore, unita, listino });
  return [
    // colore esterno: decide la maggiorazione del serramento
    o("Colore esterno", "Bianco massa", 0),
    ...PELLICOLE_OPTIMA.map((c) => o("Colore esterno", `${c} — pellicola`, 20, "ZENITH", "PERCENTUALE")),
    o("Colore esterno", "Colore fuori standard (a campione)", 20, "ZENITH", "PERCENTUALE"),
    o("Colore esterno", "Pellicola fuori standard su un lato (PF3A)", 30, "ZENITH_PF3A", "PERCENTUALE"),
    // colore interno: bianco o uguale all'esterno senza costi; pellicola solo dentro (fuori bianco) +20%;
    // diversa da quella esterna = +100% in tutto (+80% oltre al +20% dell'esterno)
    o("Colore interno", "Bianco massa", 0),
    o("Colore interno", "Uguale all'esterno", 0),
    ...PELLICOLE_OPTIMA.map((c) => o("Colore interno", `${c} — pellicola con esterno bianco massa`, 20, "ZENITH", "PERCENTUALE")),
    ...PELLICOLE_OPTIMA.map((c) => o("Colore interno", `${c} — pellicola diversa da quella esterna`, 80, "ZENITH", "PERCENTUALE")),
    // vetri
    o("Vetri", "Vetrocamera stratificato di sicurezza 3+3 basso emissivo / 18 argon / 3+3 (di serie)", 0, "ZENITH_DOPPIO"),
    o("Vetri", "Vetrocamera triplo basso emissivo con gas argon (di serie)", 0, "ZENITH_TRIPLO"),
    o("Vetri", "Vetro STC a controllo solare (a vetro)", 150, "ZENITH", "FISSO", "vetro"),
    o("Vetri", "Vetro satinato (ad anta)", 90, "ZENITH_F", "FISSO", "anta"),
    o("Vetri", "Vetro satinato (ad anta)", 150, "ZENITH_PF", "FISSO", "anta"),
    ...vetriSpeciali("ZENITH", { stratificatoDiSerie: true }),
    // accessori, tutti nella stessa tendina
    o("Accessori", "Maniglia passante con cilindro europeo", 500),
    o("Accessori", "Motore per wasistas (bianco o nero, con pulsante; corrente a carico del cliente)", 350, "ZENITH_WAS"),
    o("Accessori", "Antifurto con cavo da 3 m (non scontabile)", 45),
    o("Accessori", "Foro per passagatto (il cliente fornisce il passagatto, o traverso + pannello fisso)", 150),
    o("Accessori", "Traverso aggiuntivo orizzontale (cad.)", 90),
    o("Accessori", "Traverso aggiuntivo verticale (cad.)", 120),
    o("Accessori", "Pannello fisso aggiuntivo (cad.)", 100, "ZENITH_PF"),
    // lavorazioni e misure
    ...formeSpeciali("ZENITH"),
    o("Misure e lavorazioni", "Oltre le misure di listino: ogni 10 cm in più (L o H)", 300),
    o("Misure e lavorazioni", "Minimo di produzione (ordine con meno di 3 pezzi; fissi meno di 2)", 450),
    o("Misure e lavorazioni", "Trasporto pezzi fuori sagoma", 350),
    // servizi (pratica ENEA e autoscala stanno in «Servizi e pratiche»)
    o("Servizi al contratto", "Smaltimento cartongesso (al mq)", 300, "ZENITH", "FISSO", "mq"),
    o("Servizi al contratto", "Smontaggio e smaltimento veranda esistente (a corpo)", 500),
  ];
}
