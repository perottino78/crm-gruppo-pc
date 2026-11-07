// Pedane autoportanti per dehors di bar e ristoranti (listino fornitore «Pedana autoportante per QBOX», pag. 318-319):
// prezzi di vendita = listino fornitore × 2 (per ora). Griglia larghezza A × sporgenza B in cm (200-600 × 200-1100).
// Il listino fornitore è a metro quadro: 320 €/m² (multistrato di betulla o gres) e 450 €/m² arrotondato ai 10 € (WPC o Ipè).
// Modulo puro: lo usano la rotta api/admin/seed-pedane e la pagina dell'offerta.

export const RICARICO_PEDANE = 2;
export const SOTTOGRUPPO_PEDANE = "Pedane autoportanti (bar e ristoranti)";
export const LARGHEZZE_PEDANE = [200, 250, 300, 350, 400, 450, 500, 550, 600];
export const SPORGENZE_PEDANE = Array.from({ length: 19 }, (_, i) => 200 + i * 50);

type Pedana = { label: string; superficie: string; euroMq: number; foto: string };
export const PEDANE: Record<string, Pedana> = {
  PEDANA_BETULLA: { label: "Pedana — multistrato di betulla", euroMq: 320, foto: "pedana-struttura.jpg",
    superficie: "pannello in multistrato di betulla h 24 mm rifinito con film protettivo antiscivolo e anticorrosione (certificato classe 1 ignifugo)" },
  PEDANA_GRES: { label: "Pedana — gres", euroMq: 320, foto: "pedana-struttura.jpg", superficie: "gres" },
  PEDANA_WPC: { label: "Pedana — doghe in WPC", euroMq: 450, foto: "pedana-wpc.jpg", superficie: "doghe in WPC" },
  PEDANA_IPE: { label: "Pedana — legno naturale di Ipè", euroMq: 450, foto: "pedana-wpc.jpg", superficie: "legno naturale di Ipè" },
};

/** Prezzo del listino fornitore per una cella (A × B in cm), come nelle tabelle di pag. 319. */
export function listinoPedana(euroMq: number, aCm: number, bCm: number): number {
  return Math.round((aCm * bCm * euroMq) / 10000 / 10) * 10;
}

export function catalogoPedane() {
  const prodotti = Object.entries(PEDANE).flatMap(([tipologia, p]) =>
    SPORGENZE_PEDANE.flatMap((b) => LARGHEZZE_PEDANE.map((a) => {
      const listino = listinoPedana(p.euroMq, a, b);
      return { tipologia, colore: "STANDARD", larghezzaMm: a, altezzaMm: b, prezzoBase: listino * RICARICO_PEDANE, listino };
    })));
  const modelli = Object.entries(PEDANE).map(([tipologia, p]) => ({
    tipologia,
    immagineUrl: `/immagini/pedane/${p.foto}`,
    descrizioneTecnica:
      `Pedana autoportante per dehors (bar, ristoranti, QBOX): struttura in acciaio zincato con travi perimetrali verniciate e piedi regolabili ` +
      `per il livellamento; superficie calpestabile in ${p.superficie}. Misure A (larghezza) da 200 a 600 cm e B (sporgenza) da 200 a 1100 cm. Prezzo di vendita.`,
  }));
  return { prodotti, modelli };
}

export const labelPedana = (tipologia: string) => PEDANE[tipologia]?.label ?? null;
export const GUIDA_PEDANE =
  "Scrivi larghezza (A) e sporgenza (B) in cm: il prezzo è quello della misura di listino uguale o subito superiore. Superficie con cementine: a preventivo.";
