// Lattoneria in alluminio pressopiegato per tende e pergole (OUTDOOR › LATTONERIA): angolari, profili, scossaline,
// copertine, gronde, pluviali e pezzi (curve, tappi, staffe, collari…). Prezzo A PESO dal prezzario del fornitore
// IL MASTRO srls (€/kg per colore): standard 14 €/kg, RAL 16 €/kg, bronzo 18 €/kg; tinta legno su ordinazione.
// Peso = sviluppo (mm) × spessore (mm) × 2,7 kg/dm³ (densità dell'alluminio) → kg al metro; i pezzi hanno una
// "lunghezza equivalente" di lamiera. Prezzo di vendita = kg × €/kg del colore × RICARICO_LATTONERIA.
// Il fornitore avverte che «i prezzi variano in base al tipo di lavorazione»: le voci sono a prezzo pieno di materiale.
// Modulo puro: lo usano la rotta api/admin/seed-lattoneria, il modulo dell'offerta e la scheda prodotto.

export const PREFISSO_LATTONERIA = "LATT_";
export const GRUPPO_LATTONERIA = "LATTONERIA";
export const DENSITA_ALLUMINIO = 2.7; // kg/dm³
/** Ricarico sul costo del materiale (per ora ×2, come le pedane: comprende piega, taglio e sfrido). */
export const RICARICO_LATTONERIA = 2;
export const FORNITORE_LATTONERIA = "IL MASTRO srls";

export type FasciaColore = "STD" | "RAL" | "BRONZO" | "FUORI_STD";
export const FASCE: Record<FasciaColore, { label: string; euroKg: number; nota?: string }> = {
  STD: { label: "Standard", euroKg: 14 },
  RAL: { label: "RAL", euroKg: 16 },
  BRONZO: { label: "Bronzo", euroKg: 18 },
  FUORI_STD: { label: "RAL fuori standard", euroKg: 18, nota: "da confermare con il fornitore" },
};

/** Colori del prezzario del fornitore (in ordine), più il RAL fuori standard a richiesta. Tinta legno: a preventivo. */
export const COLORI_LATTONERIA: { nome: string; fascia: FasciaColore }[] = [
  { nome: "Bianco", fascia: "STD" },
  { nome: "Avorio", fascia: "STD" },
  { nome: "Argento (alluminio)", fascia: "STD" },
  { nome: "Argento OX5", fascia: "RAL" },
  { nome: "RAL 7035 grigio luce", fascia: "RAL" },
  { nome: "RAL 7001 grigio argento", fascia: "RAL" },
  { nome: "RAL 7016 grigio antracite", fascia: "RAL" },
  { nome: "Nero", fascia: "RAL" },
  { nome: "RAL 8017 marrone cioccolato", fascia: "RAL" },
  { nome: "RAL 6005 verde muschio", fascia: "RAL" },
  { nome: "Bronzo", fascia: "BRONZO" },
  { nome: "RAL fuori standard (a richiesta)", fascia: "FUORI_STD" },
];

export type SottogruppoLatt = "Angolari e profili" | "Scossaline e copertine" | "Gronde e pluviali" | "Curve, tappi e staffe";
export type ArticoloLatt = {
  codice: string; // diventa la tipologia LATT_<codice>
  nome: string;
  sottogruppo: SottogruppoLatt;
  /** sviluppo della lamiera (somma dei lati) in mm */
  sviluppoMm: number;
  /** spessore in mm (10/10 = 1 mm) */
  spessoreMm: number;
  /** ML = al metro lineare; PZ = al pezzo, con la lamiera equivalente in mm di lunghezza */
  um: "ML" | "PZ";
  lunghezzaPezzoMm?: number;
  uso: string;
};

const A = (codice: string, nome: string, sviluppoMm: number, spessoreMm: number, uso: string): ArticoloLatt =>
  ({ codice, nome, sottogruppo: "Angolari e profili", sviluppoMm, spessoreMm, um: "ML", uso });
const S = (codice: string, nome: string, sviluppoMm: number, spessoreMm: number, uso: string): ArticoloLatt =>
  ({ codice, nome, sottogruppo: "Scossaline e copertine", sviluppoMm, spessoreMm, um: "ML", uso });
const G = (codice: string, nome: string, sviluppoMm: number, spessoreMm: number, uso: string): ArticoloLatt =>
  ({ codice, nome, sottogruppo: "Gronde e pluviali", sviluppoMm, spessoreMm, um: "ML", uso });
const P = (codice: string, nome: string, sviluppoMm: number, spessoreMm: number, lunghezzaPezzoMm: number, uso: string): ArticoloLatt =>
  ({ codice, nome, sottogruppo: "Curve, tappi e staffe", sviluppoMm, spessoreMm, um: "PZ", lunghezzaPezzoMm, uso });

export const ARTICOLI_LATTONERIA: ArticoloLatt[] = [
  // — Angolari a L lati uguali e disuguali, profili a U, Z, piatti
  A("ANG20X20", "Angolare 20×20 sp. 10/10", 40, 1, "rifinitura di spigoli e chiusure leggere"),
  A("ANG30X30", "Angolare 30×30 sp. 15/10", 60, 1.5, "rifinitura di spigoli, chiusura teli e coprifili"),
  A("ANG40X40", "Angolare 40×40 sp. 15/10", 80, 1.5, "spigoli di pergole e tende, raccordo montanti"),
  A("ANG50X50", "Angolare 50×50 sp. 15/10", 100, 1.5, "spigoli di pergole, battute e rinforzi"),
  A("ANG60X60", "Angolare 60×60 sp. 20/10", 120, 2, "rinforzi e coprigiunti di struttura"),
  A("ANG80X80", "Angolare 80×80 sp. 20/10", 160, 2, "coprigiunti e chiusure su travi"),
  A("ANG100X100", "Angolare 100×100 sp. 20/10", 200, 2, "rivestimento di spigoli di travi e pilastri"),
  A("ANG150X150", "Angolare 150×150 sp. 20/10", 300, 2, "rivestimento di travi e pilastri grandi"),
  A("ANG30X50", "Angolare disuguale 30×50 sp. 15/10", 80, 1.5, "battute di vetrate e chiusure laterali"),
  A("ANG40X60", "Angolare disuguale 40×60 sp. 15/10", 100, 1.5, "battute e raccordi a muro"),
  A("ANG50X100", "Angolare disuguale 50×100 sp. 20/10", 150, 2, "raccordi trave–muro e chiusure di testa"),
  A("U20X30X20", "Profilo a U 20×30×20 sp. 15/10", 70, 1.5, "guida, canalina e copribordo di pannelli"),
  A("U30X50X30", "Profilo a U 30×50×30 sp. 15/10", 110, 1.5, "copribordo di pannelli e lastre"),
  A("U40X100X40", "Profilo a U 40×100×40 sp. 20/10", 180, 2, "carter e rivestimento di travi"),
  A("Z30X50X30", "Profilo a Z 30×50×30 sp. 15/10", 110, 1.5, "battute e sormonti fra lastre e muro"),
  A("GOCCIOLATOIO", "Gocciolatoio sviluppo 100 sp. 10/10", 100, 1, "rompigoccia sotto teli, lastre e davanzali"),
  A("PIATTO50", "Piatto (bandella) 50 sp. 20/10", 50, 2, "coprifili, fermi e rinforzi"),
  A("PIATTO100", "Piatto (bandella) 100 sp. 20/10", 100, 2, "coprifili larghi e piastre"),
  A("LAMIERA1000", "Lamiera piana 1000 sp. 10/10 (1 ml = 1 m²)", 1000, 1, "tamponamenti e sagome su misura"),
  // — Scossaline, copertine, fasce e carter
  S("SCOSS200", "Scossalina a muro sviluppo 200 sp. 10/10", 200, 1, "raccordo a muro di tende da sole e pergole addossate"),
  S("SCOSS250", "Scossalina parapioggia sviluppo 250 sp. 10/10", 250, 1, "protezione pioggia sopra il cassonetto della tenda"),
  S("SCOSS333", "Scossalina sviluppo 333 sp. 10/10", 333, 1, "raccordo copertura pergola–muro"),
  S("SCOSS400", "Scossalina sviluppo 400 sp. 10/10", 400, 1, "raccordo copertura–muro con risvolto lungo"),
  S("SCOSS500", "Scossalina sviluppo 500 sp. 12/10", 500, 1.2, "raccordo di coperture grandi e converse"),
  S("COPERT333", "Copertina muretto sviluppo 333 sp. 10/10", 333, 1, "copertura di muretti e parapetti fino a ~25 cm"),
  S("COPERT500", "Copertina muretto sviluppo 500 sp. 12/10", 500, 1.2, "copertura di muretti e parapetti fino a ~40 cm"),
  S("FASCIA200", "Fascia frontale / mantovana sviluppo 200 sp. 15/10", 200, 1.5, "fascia di finitura frontale di pergole"),
  S("FASCIA300", "Fascia frontale / mantovana sviluppo 300 sp. 15/10", 300, 1.5, "fascia di finitura frontale alta"),
  S("CARTER400", "Carter copri tenda sviluppo 400 sp. 15/10", 400, 1.5, "cassonetto di protezione per tende a rullo e bracci"),
  S("CARTER500", "Carter copri tenda sviluppo 500 sp. 15/10", 500, 1.5, "cassonetto di protezione per tende grandi"),
  // — Gronde e pluviali
  G("GRONDA250Q", "Canale di gronda quadro sviluppo 250 sp. 8/10", 250, 0.8, "gronda per pergole e piccole coperture"),
  G("GRONDA333Q", "Canale di gronda quadro sviluppo 333 sp. 8/10", 333, 0.8, "gronda standard per pergole e tettoie"),
  G("GRONDA400Q", "Canale di gronda quadro sviluppo 400 sp. 10/10", 400, 1, "gronda per coperture grandi"),
  G("GRONDA250T", "Canale di gronda tondo sviluppo 250 sp. 8/10", 250, 0.8, "gronda semitonda per piccole coperture"),
  G("GRONDA333T", "Canale di gronda tondo sviluppo 333 sp. 8/10", 333, 0.8, "gronda semitonda standard"),
  G("GRONDA500P", "Canale gronda per pergola sviluppo 500 sp. 15/10", 500, 1.5, "canale portante / a vasca integrato nella pergola"),
  G("PLUV80", "Pluviale tondo Ø 80 sp. 8/10", 262, 0.8, "scarico delle gronde sviluppo 250–333"),
  G("PLUV100", "Pluviale tondo Ø 100 sp. 8/10", 325, 0.8, "scarico delle gronde sviluppo 333–400"),
  G("PLUV80Q", "Pluviale quadro 80×80 sp. 8/10", 330, 0.8, "scarico squadrato, abbinato alle gronde quadre"),
  // — Curve, tappi, staffe e pezzi (al pezzo)
  P("CURVA80", "Curva pluviale Ø 80 (45° o 87°)", 262, 0.8, 300, "cambio di direzione del pluviale"),
  P("CURVA100", "Curva pluviale Ø 100 (45° o 87°)", 325, 0.8, 350, "cambio di direzione del pluviale"),
  P("CURVA80Q", "Curva pluviale quadra 80×80", 330, 0.8, 350, "cambio di direzione del pluviale quadro"),
  P("TERMINALE80", "Terminale di scarico Ø 80 (gomito a terra)", 262, 0.8, 300, "uscita del pluviale a terra / in pozzetto"),
  P("BOCCHETTONE80", "Bocchettone gronda–pluviale Ø 80", 300, 0.8, 250, "raccordo fra canale di gronda e pluviale"),
  P("BOCCHETTONE100", "Bocchettone gronda–pluviale Ø 100", 360, 0.8, 280, "raccordo fra canale di gronda e pluviale"),
  P("TESTATA250", "Testata (tappo) canale sviluppo 250, dx o sx", 150, 0.8, 120, "chiusura di testa del canale"),
  P("TESTATA333", "Testata (tappo) canale sviluppo 333, dx o sx", 180, 0.8, 150, "chiusura di testa del canale"),
  P("TESTATA500P", "Testata (tappo) canale pergola sviluppo 500", 250, 1.5, 200, "chiusura di testa del canale della pergola"),
  P("ANGOLO250", "Angolo canale sviluppo 250 (interno o esterno)", 250, 0.8, 500, "giro d'angolo del canale di gronda"),
  P("ANGOLO333", "Angolo canale sviluppo 333 (interno o esterno)", 333, 0.8, 500, "giro d'angolo del canale di gronda"),
  P("GIUNTO333", "Giunto di dilatazione canale sviluppo 250–333", 333, 0.8, 120, "unione fra due tratti di canale"),
  P("STAFFA250", "Staffa (cicogna) per canale sviluppo 250 — piatto 25×4", 25, 4, 400, "sostegno del canale di gronda"),
  P("STAFFA333", "Staffa (cicogna) per canale sviluppo 333 — piatto 25×4", 25, 4, 480, "sostegno del canale di gronda"),
  P("STAFFAMURO", "Staffa a muro a L per scossalina/profilo — piatto 40×5", 40, 5, 200, "fissaggio a muro di scossaline, profili e carter"),
  P("COLLARE80", "Collare per pluviale Ø 80 con tassello", 20, 2, 300, "fissaggio a muro del pluviale"),
  P("COLLARE100", "Collare per pluviale Ø 100 con tassello", 20, 2, 360, "fissaggio a muro del pluviale"),
  P("TAPPOANG50", "Tappo di chiusura per angolare fino a 50×50", 100, 1.5, 50, "chiusura di testa di angolari e profili"),
  P("TAPPOANG100", "Tappo di chiusura per angolare fino a 100×100", 200, 2, 100, "chiusura di testa di angolari e profili"),
  P("TAPPOSCOSS", "Testata per scossalina/copertina fino a sviluppo 333", 333, 1, 80, "chiusura di testa di scossaline e copertine"),
  P("ANGOLOSCOSS", "Angolo per scossalina/copertina fino a sviluppo 333", 333, 1, 400, "giro d'angolo di scossaline e copertine"),
  P("COPRIGIUNTO", "Coprigiunto per scossalina/copertina fino a sviluppo 333", 333, 1, 100, "sormonto fra due tratti di scossalina"),
];

export const tipologiaLatt = (codice: string) => `${PREFISSO_LATTONERIA}${codice}`;
const perTipologia = new Map(ARTICOLI_LATTONERIA.map((a) => [tipologiaLatt(a.codice), a]));
export const articoloLatt = (tipologia: string) => perTipologia.get(tipologia) ?? null;

/** Peso in kg: al metro per gli articoli ML, al pezzo per i PZ. */
export function pesoKg(a: ArticoloLatt): number {
  const kgMl = (a.sviluppoMm * a.spessoreMm * DENSITA_ALLUMINIO) / 1000;
  return a.um === "ML" ? kgMl : (kgMl * (a.lunghezzaPezzoMm ?? 1000)) / 1000;
}

/** Prezzo di vendita (al metro o al pezzo) per un €/kg: arrotondato ai 10 centesimi, mai sotto 1 €. */
export function prezzoLatt(a: ArticoloLatt, euroKg: number, ricarico = RICARICO_LATTONERIA): number {
  return Math.max(1, Math.round(pesoKg(a) * euroKg * ricarico * 10) / 10);
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
export const coloreLatt = (nome: string, fascia: FasciaColore, um: "ML" | "PZ") =>
  `${nome} — ${FASCE[fascia].euroKg} €/kg${FASCE[fascia].nota ? ` (${FASCE[fascia].nota})` : ""} — ${um === "ML" ? "al metro" : "al pezzo"}`;

export function catalogoLattoneria() {
  const prodotti = ARTICOLI_LATTONERIA.flatMap((a) =>
    COLORI_LATTONERIA.map((c) => ({
      tipologia: tipologiaLatt(a.codice), colore: coloreLatt(c.nome, c.fascia, a.um), larghezzaMm: 0, altezzaMm: 0,
      prezzoBase: prezzoLatt(a, FASCE[c.fascia].euroKg),
    })));
  const modelli = ARTICOLI_LATTONERIA.map((a) => {
    const kg = pesoKg(a);
    return {
      tipologia: tipologiaLatt(a.codice),
      descrizioneTecnica:
        `${a.nome}: alluminio pressopiegato preverniciato, uso: ${a.uso}. ` +
        (a.um === "ML"
          ? `Sviluppo ${a.sviluppoMm} mm, spessore ${fmt(a.spessoreMm, 1)} mm, peso circa ${fmt(kg, 3)} kg al metro. Prezzo al metro lineare (si scrive la lunghezza in cm). `
          : `Peso circa ${fmt(kg, 3)} kg al pezzo. Prezzo al pezzo. `) +
        `Prezzo a peso dal prezzario ${FORNITORE_LATTONERIA}: standard (bianco, avorio, argento) 14 €/kg, RAL (argento OX5, 7035, 7001, 7016, nero, 8017, 6005) 16 €/kg, ` +
        `bronzo 18 €/kg; RAL fuori standard da confermare; tinta legno su ordinazione (a preventivo). Il prezzo può variare con la lavorazione.`,
    };
  });
  return { prodotti, modelli };
}

export const sottogruppoLatt = (tipologia: string) => articoloLatt(tipologia)?.sottogruppo ?? null;
export const labelLatt = (tipologia: string) => articoloLatt(tipologia)?.nome ?? null;
/** true per gli articoli venduti al metro lineare (nell'offerta si scrive la lunghezza). */
export const lattAlMetro = (tipologia: string) => articoloLatt(tipologia)?.um === "ML";

/** Prezzo di un pezzo lungo `cm` centimetri a partire dal prezzo al metro (arrotondato al centesimo). */
export const prezzoPerLunghezza = (prezzoMl: number, cm: number) => Math.round(prezzoMl * (cm / 100) * 100) / 100;

export const GUIDA_LATTONERIA =
  "Prezzo a peso (kg × €/kg del colore, ricarico compreso). Per i profili al metro scrivi la lunghezza di ogni pezzo in cm e la quantità di pezzi; " +
  "curve, tappi e staffe sono al pezzo. Tinta legno e lavorazioni speciali (più pieghe, sagome, fori): a preventivo dal fornitore.";
