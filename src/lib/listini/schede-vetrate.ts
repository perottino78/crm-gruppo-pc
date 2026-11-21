// Schede tecniche delle vetrate panoramiche Scintilla (scorrevole senza profili verticali) e Brillante (scorrevole e a pacchetto) (richiesta di Ugo 20/11/2026).
// PDF e pagine in public/cataloghi/<scintilla|brillante>/; dal PDF del fornitore sono stati tolti nome, sede, QR, social e certificati con la sua ragione sociale,
// il nome del sistema è quello P&C e i colori sono quelli del marchio (script scripts/listini/pulisci_schede_vetrate.py). Modulo puro.
export const PREFISSO_SCINTILLA = "VETRATA_SCINTILLA";
export const PREFISSO_BRILLANTE = "VETRATA_BRILLANTE";

export const DESCRIZIONE_CLIENTE_SCINTILLA =
  "Vetrata scorrevole Scintilla, senza profili verticali: ante in vetro temperato da 10 mm che scorrono su guida inferiore e si aprono su un lato o su entrambi; " +
  "altezza fino a 3 m, cuscinetti ad alta qualità in grado di sostenere fino a 80 kg, testati su oltre 40.000 cicli di apertura, sistema anti-scavalco delle ante; " +
  "finiture in alluminio cromo opaco, bianco, argento o nero oppure RAL. Marcatura CE e 3 anni di garanzia.";

export const DESCRIZIONE_CLIENTE_BRILLANTE =
  "Vetrata panoramica Brillante, scorrevole e a pacchetto: pannelli in vetro temperato da 10 mm (28 kg/m²) incollati al profilo che scorrono sulla guida inferiore, " +
  "ideale dove il tetto non può sostenere il peso del sistema; altezza fino a 3 m, larghezza illimitata, ante fino a 800 mm, profilo inferiore anche incassato. " +
  "Resistenza al vento classe 6 e tenuta all'acqua classe 1A. Finiture anodizzate, RAL o finto legno. Marcatura CE e 3 anni di garanzia.";

export const SCHEDE_VETRATE = {
  SCINTILLA: { chiave: "SCINTILLA", nome: "Scheda tecnica Scintilla", prefisso: PREFISSO_SCINTILLA, descrizione: DESCRIZIONE_CLIENTE_SCINTILLA, pdf: "/cataloghi/scintilla/scintilla-scheda-tecnica.pdf", cartella: "/cataloghi/scintilla", pagine: 8 },
  BRILLANTE: { chiave: "BRILLANTE", nome: "Scheda tecnica Brillante", prefisso: PREFISSO_BRILLANTE, descrizione: DESCRIZIONE_CLIENTE_BRILLANTE, pdf: "/cataloghi/brillante/brillante-scheda-tecnica.pdf", cartella: "/cataloghi/brillante", pagine: 12 },
} as const;
