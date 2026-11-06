// Porte a vetro per vetrate (listino fornitore «VETRATE – PORTE», pag. 38-39): prezzi di vendita = listino + 60%.
// Modulo puro: lo usano la rotta api/admin/seed-porte-vetro e la pagina dell'offerta.

export const RICARICO_PORTE_VETRO = 1.6;
export const GRUPPO_PORTE_VETRO = "VETRATE PORTE"; // in tendina: VETRATE › Porte a vetro
const vendita = (listino: number) => Math.round(listino * RICARICO_PORTE_VETRO * 100) / 100;

type Porta = { label: string; foto: string; descrizione: string; varianti: { nome: string; listino: number }[] };
export const PORTE_VETRO: Record<string, Porta> = {
  PORTAVETRO_PAL: {
    label: "Porta vetro e alluminio",
    foto: "porta-vetro-alluminio.jpg",
    descrizione:
      "Porta a battente in vetro e alluminio (cod. A1705PAL): si installa su stipiti o montanti già esistenti, apertura a 90° interna o esterna. " +
      "Telaio in alluminio a taglio freddo nei colori RAL di serie o altre finiture. Vetro stratificato trasparente 10 mm. " +
      "Maniglia, serratura e cerniere di serie in nero opaco (maniglione antipanico come accessorio). Dimensioni massime L 1000 × H 2500 mm (fino a H 3000 con maggiorazione).",
    varianti: [
      { nome: "Telaio a 3 lati (cod. A1705PA3)", listino: 1630 },
      { nome: "Telaio a 4 lati (cod. A1705PA4)", listino: 1630 },
    ],
  },
  PORTAVETRO_PTV: {
    label: "Porta tutto vetro",
    foto: "porta-tutto-vetro.jpg",
    descrizione:
      "Porta a battente «tutto vetro» (cod. A1705PTV) senza telaio, fissata con cerniere in acciaio superiore e inferiore: valorizza al massimo la vetrata. " +
      "Apertura a 90°, disponibile anche apribile verso entrambi gli ambienti. Vetro temperato trasparente 10 mm, doppio maniglione in acciaio, " +
      "serratura di riservatezza a pavimento. Dimensioni massime L 1000 × H 2500 mm (fino a H 3000 con maggiorazione).",
    varianti: [{ nome: "Porta tutto vetro (cod. A1705PTV)", listino: 2830 }],
  },
};

export const labelPortaVetro = (tipologia: string) => PORTE_VETRO[tipologia]?.label ?? null;

export const GUIDA_PORTE_VETRO =
  "Prezzo porta fino a L 1000 × H 2500 mm. Altezza oltre 2500 (max 3000): +5%. Le finiture speciali del vetro sono su richiesta (listino fornitore pag. 19).";

export type OptionalPortaVetro = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; listino: string };

export function catalogoPorteVetro() {
  const prodotti = Object.entries(PORTE_VETRO).flatMap(([tipologia, p]) =>
    p.varianti.map((v) => ({ tipologia, colore: v.nome, larghezzaMm: 0, altezzaMm: 0, prezzoBase: vendita(v.listino) })));
  const o = (listino: string, categoria: string, nome: string, valore: number, tipoPrezzo: "FISSO" | "PERCENTUALE" = "FISSO"): OptionalPortaVetro =>
    ({ categoria, nome, tipoPrezzo, valore: tipoPrezzo === "FISSO" ? vendita(valore) : valore, listino });
  const optional: OptionalPortaVetro[] = [
    o("PORTAVETRO", "Misure", "Altezza oltre 2500 mm (massimo 3000 mm)", 5, "PERCENTUALE"),
    o("PORTAVETRO_PAL", "Apertura", "Apertura esterna (telaio pari)", 0),
    o("PORTAVETRO_PAL", "Apertura", "Apertura interna (telaio pari)", 0),
    o("PORTAVETRO_PTV", "Apertura", "Apertura verso l'esterno", 0),
    o("PORTAVETRO_PTV", "Apertura", "Apertura verso l'interno", 0),
    o("PORTAVETRO_PTV", "Apertura", "Apribile verso entrambi gli ambienti", 0),
    o("PORTAVETRO_PAL", "Accessori", "Maniglione antipanico (cod. A1705PA5)", 302),
    o("PORTAVETRO_PAL", "Colore telaio", "Colore RAL di serie", 0),
  ];
  const modelli = Object.entries(PORTE_VETRO).map(([tipologia, p]) => ({
    tipologia, descrizioneTecnica: `${p.descrizione} Prezzi di vendita.`, immagineUrl: `/immagini/porte-vetro/${p.foto}`,
  }));
  return { prodotti, optional, modelli };
}

/** Listini degli optional validi per la tipologia (comune + specifico della porta). */
export function listiniPorteVetro(tipologia: string): string[] {
  return PORTE_VETRO[tipologia] ? ["PORTAVETRO", tipologia] : [];
}
