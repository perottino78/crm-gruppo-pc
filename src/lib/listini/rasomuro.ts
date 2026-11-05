// Listino porte e chiusure RASO MURO (MYA, KIUSO, STRIP): prezzi già di VENDITA (coefficiente 1).
// Fonte: «LISTINO RASO MURO» + cataloghi MYA / KIUSO / STRIP 2020. Modulo puro (niente DB):
// lo usa la rotta di caricamento (api/admin/seed-rasomuro) e l'offerta (tendine, misure, accessori).

export const PREFISSO_RASOMURO = "RASOMURO_";
export const GRUPPO_RASOMURO = "PORTE INTERNE";

/** Finiture dell'anta, nell'ordine delle colonne del listino. */
export const FINITURE_RASOMURO = [
  "Laminato CPL",
  "Laccato opaco",
  "Laccato RAL lucido",
  "Vetro trasparente",
  "Vetro satinato bianco",
  "Vetro satinato bronzo",
  "Vetro riflettente",
  "Vetro laccato lucido",
  "Vetro opaco",
] as const;

const TELAI_MYA = [
  "Telaio filo muro sp. 44 mm (di serie)",
  "Telaio filo muro sp. 102 mm",
  "Telaio filo muro sp. da 85 a 150 mm",
  "Telaio centro muro sp. 102 o da 85 a 150 mm",
];
const TELAI_SCI = [
  "Telaio per parete in cartongesso sp. 100 mm",
  "Telaio per parete in muratura sp. 105 mm",
  "Telaio per cartongesso e muratura sp. 125 mm",
];

type Fin = (number | null)[];
type Riga = { cod: string; misura: string; larghezze: number[]; altezze: number[]; telai: number[]; finiture: Fin; anta?: number };
type Apertura = {
  linea: "MYA" | "KIUSO";
  cod: string;
  label: string;
  foto: string;
  telai: string[];
  /** true = il prezzo della riga è il SOLO telaio e le finiture sono il prezzo dell'anta (scorrevole centro muro). */
  telaioSenzaAnta?: boolean;
  suMisura: [string, number][];
  extra: [string, number][];
  doppia: { cod: string; label: string };
  descrizione: string;
  righe: Riga[];
};

const L_68_98 = [68, 78, 88, 98];
const L_68_108 = [68, 78, 88, 98, 108];
const L_108_138 = [108, 118, 128, 138];
const L_148_188 = [148, 158, 168, 178, 188];
const NON_VETRI = "(il «su misura» non si paga sulle porte con ante a vetri)";

export const APERTURE_RASOMURO: Apertura[] = [
  {
    linea: "MYA", cod: "BATT", label: "Battente", foto: "mya-battente.jpg", telai: TELAI_MYA,
    suMisura: [[`Riduzione in larghezza (porta su misura) ${NON_VETRI}`, 291], [`Riduzione in altezza (porta su misura) ${NON_VETRI}`, 96]],
    extra: [],
    doppia: { cod: "BATT2A", label: "Battente 2 ante / obliqua" },
    descrizione: "Porta MYA raso muro battente: prezzo per porta a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie (serratura magnetica, cerniere a scomparsa). Reversibile solo con telaio da 44 mm e anta sovraverniciabile, CPL o laccata.",
    righe: [
      { cod: "H215", misura: "L 68-78-88-98 × H 215", larghezze: L_68_98, altezze: [215], telai: [865, 1012, 1162, 1309], finiture: [99, 413, 820, 1483, 1645, 1805, 1846, 2098, 2260] },
      { cod: "H245", misura: "L 68-78-88-98 × H 245", larghezze: L_68_98, altezze: [245], telai: [1155, 1335, 1515, 1695], finiture: [null, 435, 845, 1521, 1670, 1846, 1862, 2178, 2363] },
      { cod: "H305", misura: "L 68-78-88-98-108 × H 305", larghezze: L_68_108, altezze: [305], telai: [1540, 1747, 1957, 2165], finiture: [null, 663, 1304, 1625, 1729, 1985, 2050, 2557, 2814] },
    ],
  },
  {
    linea: "MYA", cod: "PIEG", label: "Pieghevole", foto: "mya-pieghevole.jpg", telai: TELAI_MYA,
    suMisura: [["Porta su misura (riduzione in L e/o in H)", 96]],
    extra: [],
    doppia: { cod: "PIEG2A", label: "Pieghevole 2 ante" },
    descrizione: "Porta MYA raso muro pieghevole: prezzo per porta a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie. Ante solo sovraverniciabili, CPL o laccate (niente vetri).",
    righe: [
      { cod: "H215", misura: "L 68-78-88-98 × H 215", larghezze: L_68_98, altezze: [215], telai: [1778, 1926, 2075, 2223], finiture: [110, 425, 830, null, null, null, null, null, null] },
      { cod: "H245", misura: "L 68-78-88-98 × H 245", larghezze: L_68_98, altezze: [245], telai: [2172, 2353, 2532, 2710], finiture: [null, 449, 920, null, null, null, null, null, null] },
      { cod: "H245XL", misura: "L 108 × H 245", larghezze: [108], altezze: [245], telai: [2545, 2730, 2916, 3101], finiture: [null, 540, 1055, null, null, null, null, null, null] },
    ],
  },
  {
    linea: "MYA", cod: "BILU", label: "Bilico unidirezionale", foto: "mya-bilico-uni.jpg", telai: TELAI_MYA,
    suMisura: [[`Porta su misura (riduzione in L e/o in H) ${NON_VETRI}`, 51]],
    extra: [["Telaio senza traverso", 20]],
    doppia: { cod: "BILU2A", label: "Bilico unidirezionale 2 ante" },
    descrizione: "Porta MYA raso muro a bilico unidirezionale: prezzo per porta a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie.",
    righe: [
      { cod: "H215", misura: "L 108-118-128-138 × H 215", larghezze: L_108_138, altezze: [215], telai: [2446, 2625, 2806, 2985], finiture: [null, 604, 1187, 760, 995, 1280, 1286, 1704, 1938] },
      { cod: "H245", misura: "L 108-118-128-138 × H 245", larghezze: L_108_138, altezze: [245], telai: [2560, 2770, 2978, 3187], finiture: [null, 682, 1349, 830, 1096, 1362, 1428, 1931, 2198] },
      { cod: "H305", misura: "L 108-118-128-138 × H 305", larghezze: L_108_138, altezze: [305], telai: [2779, 3000, 3226, 3449], finiture: [null, 834, 1669, 995, 1322, 1664, 1745, 2423, 2756] },
      { cod: "H305XL", misura: "L 148-158-168-178-188 × H 305", larghezze: L_148_188, altezze: [305], telai: [3265, 3505, 3745, 3985], finiture: [null, 1131, 2285, 996, 1723, 2186, 2302, 3342, 3803] },
    ],
  },
  {
    linea: "MYA", cod: "BILB", label: "Bilico bidirezionale", foto: "mya-bilico-bi.jpg", telai: TELAI_MYA,
    suMisura: [[`Porta su misura (riduzione in L e/o in H) ${NON_VETRI}`, 51]],
    extra: [["Telaio senza traverso", 20], ["Porta senza telaio perimetrale (riduzione)", -200]],
    doppia: { cod: "BILB2A", label: "Bilico bidirezionale 2 ante" },
    descrizione: "Porta MYA raso muro a bilico bidirezionale: prezzo per porta a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie.",
    righe: [
      { cod: "H215", misura: "L 108-118-128-138 × H 215", larghezze: L_108_138, altezze: [215], telai: [2654, 2803, 2951, 3099], finiture: [null, 603, 1186, 760, 995, 1228, 1285, 1705, 1937] },
      // Nel PDF il laccato RAL lucido di questa riga è «€ 725» (meno del laccato opaco): refuso, si usa 1.349 come la riga uguale dell'unidirezionale.
      { cod: "H245", misura: "L 108-118-128-138 × H 245", larghezze: L_108_138, altezze: [245], telai: [2770, 2770, 3130, 3309], finiture: [null, 681, 1349, 829, 1095, 1362, 1428, 1932, 2198] },
      { cod: "H305", misura: "L 108-118-128-138 × H 305", larghezze: L_108_138, altezze: [305], telai: [2987, 3210, 3432, 3655], finiture: [null, 835, 1669, 996, 1328, 1663, 1745, 2423, 2756] },
      { cod: "H305XL", misura: "L 148-158-168-178-188 × H 305", larghezze: L_148_188, altezze: [305], telai: [3473, 3713, 3953, 4193], finiture: [null, 1131, 2285, 1262, 1723, 2186, 2301, 3343, 3803] },
    ],
  },
  {
    linea: "MYA", cod: "SCE", label: "Scorrevole esterno muro", foto: "mya-scorrevole-esterno.jpg", telai: TELAI_MYA.slice(0, 3),
    suMisura: [[`Porta su misura (riduzione in L e/o in H) ${NON_VETRI}`, 51]],
    extra: [],
    doppia: { cod: "SCE2A", label: "Scorrevole esterno muro 2 ante" },
    descrizione: "Porta MYA scorrevole esterno muro: prezzo per porta a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie.",
    righe: [
      { cod: "H215", misura: "L 68-78-88-98 × H 215", larghezze: L_68_98, altezze: [215], telai: [2717, 2865, 3014], finiture: [145, 435, 842, 720, 883, 1044, 1085, 1303, 1465] },
      { cod: "H245", misura: "L 68-78-88-98 × H 245", larghezze: L_68_98, altezze: [245], telai: [2818, 2999, 3178], finiture: [null, 492, 952, 770, 883, 1067, 1115, 1394, 1579] },
      { cod: "H305", misura: "L 68-78-88-98-108 × H 305", larghezze: L_68_108, altezze: [305], telai: [3088, 3296, 3315], finiture: [null, 598, 1178, 858, 1149, 1320, 1379, 1705, 1938] },
      { cod: "H305XL", misura: "L 118-128-138 × H 305", larghezze: [118, 128, 138], altezze: [305], telai: [3522, 3745, 3967], finiture: [null, 835, 1669, 913, 1247, 1579, 1663, 2350, 2685] },
    ],
  },
  {
    linea: "MYA", cod: "SCI", label: "Scorrevole centro muro", foto: "mya-scorrevole-centro.jpg", telai: TELAI_SCI, telaioSenzaAnta: true,
    suMisura: [[`Anta su misura (riduzione in L e/o in H) ${NON_VETRI}`, 96]],
    extra: [],
    doppia: { cod: "SCI2A", label: "Scorrevole centro muro 2 ante" },
    descrizione: "MYA scorrevole centro muro (a scomparsa): il prezzo della riga è il SOLO telaio completo; l'anta (sovraverniciabile o in finitura) si aggiunge sotto. L'anta MYA si può montare anche su telai di altre marche per ante da 44 mm. Telai su misura (L di 5 in 5 cm, H di 10 in 10 cm) senza maggiorazione.",
    righe: [
      // Nel PDF il telaio «muratura» H 210 è «€ 110»: refuso, si usa 1.110 come il cartongesso (alle altre altezze sono uguali).
      { cod: "H210", misura: "L 60-70-80-90 × H 210", larghezze: [60, 70, 80, 90], altezze: [210], telai: [1110, 1110, 1209], anta: 327, finiture: [364, 699, 1104, 1699, 1861, 2022, 2064, 2283, 2445] },
      { cod: "H240", misura: "L 60-70-80-90 × H 240", larghezze: [60, 70, 80, 90], altezze: [240], telai: [1620, 1620, 1718], anta: 360, finiture: [null, 787, 1249, 1794, 1979, 2163, 2210, 2489, 2675] },
      { cod: "H260", misura: "L 100-110-120 × H 260", larghezze: [100, 110, 120], altezze: [260], telai: [2252, 2252, 2425], anta: 856, finiture: [null, 1586, 2253, 2150, 2417, 2685, 2749, 3173, 3445] },
    ],
  },
  {
    linea: "KIUSO", cod: "K100", label: "K100 (1 anta)", foto: "kiuso.jpg", telai: ["Telaio filo muro sp. 102 mm (di serie)"],
    suMisura: [[`Chiusura su misura (riduzione in L e/o in H) ${NON_VETRI}`, 96]],
    extra: [["Telaio senza traverso superiore e/o inferiore", 20], ["Chiusura con chiave", 50], ["Braccetti di ritegno per installazione a ribalta (solo K100)", 120]],
    doppia: { cod: "K200", label: "K200 / K202 / obliqua (2 ante)" },
    descrizione: "KIUSO chiusura a scomparsa raso muro (vani tecnici, sottoscala, contatori): prezzo per chiusura a 1 anta completa di telaio, anta sovraverniciabile e accessori di serie. K200 = 2 ante affiancate, K202 = 2 ante sovrapposte.",
    righe: [
      { cod: "H098", misura: "L 38-78 × H 38-98", larghezze: [38, 48, 58, 68, 78], altezze: [38, 48, 58, 68, 78, 88, 98], telai: [671], finiture: [110, 118, 219, 276, 308, 343, 354, 420, 453] },
      { cod: "H148", misura: "L 38-78 × H 108-148", larghezze: [38, 48, 58, 68, 78], altezze: [108, 118, 128, 138, 148], telai: [825], finiture: [192, 204, 383, 485, 540, 601, 621, 733, 796] },
      { cod: "H208", misura: "L 38-78 × H 158-208", larghezze: [38, 48, 58, 68, 78], altezze: [158, 168, 178, 188, 198, 208], telai: [977], finiture: [273, 293, 546, 693, 773, 859, 889, 1047, 1137] },
      { cod: "H268", misura: "L 38-78 × H 218-268", larghezze: [38, 48, 58, 68, 78], altezze: [218, 228, 238, 248, 258, 268], telai: [1130], finiture: [null, 375, 702, 890, 993, 1105, 1143, 1349, 1460] },
      { cod: "H308", misura: "L 38-78 × H 278-308", larghezze: [38, 48, 58, 68, 78], altezze: [278, 288, 298, 308], telai: [1232], finiture: [null, 437, 820, 1040, 1160, 1288, 1335, 1573, 1704] },
    ],
  },
];

/** STRIP: battiscopa filomuro e accessori, prezzo per unità (m/l, pezzo, coppia). */
export const STRIP_RASOMURO: { nome: string; prezzo: number }[] = [
  { nome: "BS 01 Base per battiscopa in alluminio grezzo — al metro (conf. 10 barre da 2 m + 15 guarnizioni BS 51)", prezzo: 22 },
  { nome: "BS 02 Battiscopa colori standard (ox argento satinato, bianco RAL 9016, nero RAL 9005 opachi) — al metro (conf. 10 barre da 2 m)", prezzo: 21 },
  { nome: "BS 02 Battiscopa altri colori RAL — al metro (conf. 10 barre da 2 m)", prezzo: 23 },
  { nome: "BS 52 Guarnizione fissa 90° per gradini — al pezzo (conf. 10 pezzi)", prezzo: 2 },
  { nome: "BS 53 Tappi terminali — alla coppia (1 dx + 1 sx)", prezzo: 5 },
  { nome: "BS 11 Base raccordata per porte con apertura a spingere — alla coppia (1 dx + 1 sx, barre 2 m)", prezzo: 35 },
];
export const TIPOLOGIA_STRIP = "RASOMURO_STRIP";

type Acc = [string, string, number];
/** Accessori: listino → [categoria, nome, prezzo]. Il listino decide su quali porte compaiono (vedi listiniRasomuro). */
const ACCESSORI: Record<string, Acc[]> = {
  RASOMURO_MYA_BPB: [
    ["Chiusure e serrature", "B 102 S Serratura magnetica con cilindro Yale a 3 chiavi completa di incontro", 53],
    ["Chiusure e serrature", "B 103 S Serratura magnetica per nottolino Privacy completa di incontro", 28],
    ["Chiusure e serrature", "B 140 S Serratura a rullo (senza fori maniglia)", 65],
    ["Chiusure e serrature", "B 140-930 K Kit serratura a rullo con maniglia incasso Tratto S alluminio ox argento", 165],
    ["Chiusure e serrature", "B 140-931 K Kit serratura a rullo con maniglia incasso Tratto S alluminio colori RAL", 175],
    ["Chiusure e serrature", "B 142 S Serratura a rullo con mandata cilindro Yale (senza fori maniglia)", 137],
    ["Chiusure e serrature", "B 116 S Serratura magnetica con maniglia a filo (Bonaiti mod. B no-ha)", 341],
    ["Chiusure e serrature", "B 117 S Serratura magnetica con maniglia a filo (Bonaiti mod. B no-ha) e nottolino Privacy", 385],
    ["Chiusure e serrature", "B 118 S Chiusura Push-Pull (senza fori maniglia)", 65],
    ["Chiusure e serrature", "B 004 V Chiudiporta idraulico integrato nell'anta", 540],
    ["Chiusure e serrature", "B 005 V Chiudiporta a molla integrato nella cerniera", 144],
    ["Chiusure e serrature", "B 006 V Chiudiporta a pavimento (apertura a bilico e compasso)", 540],
    ["Chiusure e serrature", "B 151 S Dispositivo per apertura elettrica (solo apertura a tirare)", 216],
    ["Planarità ante", "B 420 V Dispositivo raddrizza-ante (porte più basse di 245; dal 245 in su è di serie)", 364],
    ["Planarità ante", "B 430 V Cerniera supplementare", 53],
  ],
  RASOMURO_MYA_SC: [
    ["Chiusure e serrature", "B 131-545 K Kit serratura a gancio chiave Patent, bocchette incasso cromo satinato", 46],
    ["Chiusure e serrature", "B 132-560 K Kit serratura a gancio con cilindro Yale, bocchette incasso cromo satinato", 70],
    ["Chiusure e serrature", "B 133-570 K Kit serratura a gancio con nottolino Privacy, incasso cromo satinato", 53],
  ],
  RASOMURO_MYA_BATT: [
    ["Fonoisolamento (battenti)", "AS 001 Anta Silent (materiali fonoisolanti)", 570],
    ["Fonoisolamento (battenti)", "TBS 001 Telaio con battuta superiore (l'esterno telaio in altezza si riduce di 1 cm)", 40],
    ["Fonoisolamento (battenti)", "B 220 V Barra mobile antirumore", 90],
  ],
  RASOMURO_MYA: [
    ["Maniglie e maniglioni", "900 P Doppia maniglia Tratto alluminio ox argento, bocchetta Patent", 140],
    ["Maniglie e maniglioni", "901 P Doppia maniglia Tratto alluminio colori RAL, bocchetta Patent", 160],
    ["Maniglie e maniglioni", "900 Y Doppia maniglia Tratto alluminio ox argento, bocchetta Yale", 150],
    ["Maniglie e maniglioni", "901 Y Doppia maniglia Tratto alluminio colori RAL, bocchetta Yale", 170],
    ["Maniglie e maniglioni", "900 L/O Doppia maniglia Tratto alluminio ox argento, nottolino Privacy", 175],
    ["Maniglie e maniglioni", "901 L/O Doppia maniglia Tratto alluminio colori RAL, nottolino Privacy (pomello cromo satinato)", 195],
    ["Maniglie e maniglioni", "930 Doppia maniglia incasso Tratto S alluminio ox argento", 100],
    ["Maniglie e maniglioni", "931 Doppia maniglia incasso Tratto S alluminio colori RAL", 110],
    ["Maniglie e maniglioni", "940 Doppia maniglia incasso Hafele inox satinato, presa a scomparsa", 135],
    ["Maniglie e maniglioni", "561 Doppia maniglia incasso Q Design cromo satinato, bocchetta Patent", 35],
    ["Maniglie e maniglioni", "561 L/O Doppia maniglia incasso Q Design cromo satinato, bocchetta Yale", 40],
    ["Maniglie e maniglioni", "561 Y Doppia maniglia incasso Q Design cromo satinato, nottolino Privacy", 60],
    ["Maniglie e maniglioni", "B 010 M Maniglione antipanico chiusura centrale", 261],
    ["Maniglie e maniglioni", "B 011 M Maniglione antipanico 2 punti, chiusura su anta semifissa", 324],
    ["Maniglie e maniglioni", "B 012 M Maniglione antipanico 3 punti di chiusura", 360],
    ["Maniglie e maniglioni", "B 015 M Maniglia esterna per antipanico", 81],
    ["Maniglie e maniglioni", "B 030 M Maniglione per disabili in orizzontale", 175],
    ["Accessori di ricambio", "B 101 S Serratura magnetica chiave Patent con incontro (di serie su battenti, pieghevoli, bilico)", 30],
    ["Accessori di ricambio", "B 764 M Bocchetta incasso quadra cromo satinato (di serie sulle scorrevoli)", 25],
    ["Accessori di ricambio", "B 130 C Cerniera a scomparsa corpo silver (di serie su battenti e pieghevoli)", 20],
    ["Accessori di ricambio", "B 13_ C Cerniera a scomparsa con corpo nei colori a catalogo (pag. 31)", 30],
    ["Accessori di ricambio", "B 140 C Cover per cerniere colore silver (di serie)", 2],
    ["Accessori di ricambio", "B 14_ C Cover per cerniere nei colori a catalogo (pag. 31)", 2],
    ["Accessori di ricambio", "B 322 V Kit guarnizione per anta MYA grigia (7,5 m)", 9],
  ],
  RASOMURO_LAV: [
    ["Lavorazioni particolari", "NFC 100 Anta senza foro chiave o con foro chiave da un solo lato", 20],
    ["Lavorazioni particolari", "NFC 100 Anta senza scasso per serrature e fori maniglia", 20],
    ["Lavorazioni particolari", "MHR 090 Anta con maniglia ad altezza 90 cm", 20],
    ["Lavorazioni particolari", "IBS 100 Telaio incassato per raccordo base battiscopa STRIP (apertura a tirare)", 50],
  ],
  RASOMURO_TRASP: [["Imballo e trasporto", "Diritto fisso per ogni spedizione (imballo compreso)", 15]],
};
/** Trasporto: + 3% sul valore della merce (va aggiunto riga per riga). */
const TRASPORTO_PERC: Acc = ["Imballo e trasporto", "Trasporto: maggiorazione sul valore merce", 3];

// ---------- tipologie ----------

export type RigaRasomuro = { apertura: Apertura; riga: Riga; doppia: boolean; tipologia: string };

const tipologiaDi = (a: Apertura, r: Riga, doppia: boolean) => `${PREFISSO_RASOMURO}${a.linea}_${doppia ? a.doppia.cod : a.cod}_${r.cod}`;

/** Tutte le tipologie porta/chiusura (1 anta e 2 ante) con la riga di listino da cui nascono. */
export function righeRasomuro(): RigaRasomuro[] {
  const out: RigaRasomuro[] = [];
  for (const a of APERTURE_RASOMURO)
    for (const r of a.righe) for (const doppia of [false, true]) out.push({ apertura: a, riga: r, doppia, tipologia: tipologiaDi(a, r, doppia) });
  return out;
}
const MAPPA = new Map<string, RigaRasomuro>();
function trova(tipologia: string): RigaRasomuro | null {
  if (!tipologia.startsWith(PREFISSO_RASOMURO)) return null;
  if (!MAPPA.size) for (const x of righeRasomuro()) MAPPA.set(x.tipologia, x);
  return MAPPA.get(tipologia) ?? null;
}

export function sottogruppoRasomuro(tipologia: string): string | null {
  if (tipologia === TIPOLOGIA_STRIP) return "Raso muro — STRIP battiscopa";
  const x = trova(tipologia);
  if (!x) return null;
  return x.apertura.linea === "MYA" ? "Raso muro — MYA porte" : "Raso muro — KIUSO chiusure";
}

/** Due tendine: 1) modello/apertura, 2) misura. */
export function assiSelezioneRasomuro(tipologia: string): { modello: { valore: string; label: string }; apertura: { valore: string; label: string } } | null {
  const x = trova(tipologia);
  if (!x) return null;
  const a = x.apertura;
  const cod = x.doppia ? a.doppia.cod : a.cod;
  const label = `${a.linea} ${x.doppia ? a.doppia.label : a.label}`;
  return { modello: { valore: `${a.linea}_${cod}`, label }, apertura: { valore: x.riga.cod, label: x.doppia ? `${x.riga.misura} (per anta)` : x.riga.misura } };
}

export function labelRasomuro(tipologia: string): string | null {
  if (tipologia === TIPOLOGIA_STRIP) return "STRIP battiscopa filomuro";
  const assi = assiSelezioneRasomuro(tipologia);
  return assi ? `${assi.modello.label} — ${assi.apertura.label}` : null;
}

/** Larghezze e altezze di listino (cm) da proporre nell'offerta. Per le 2 ante sono le misure di ogni anta. */
export function misureRasomuro(tipologia: string): { larghezze: number[]; altezze: number[]; perAnta: boolean } | null {
  const x = trova(tipologia);
  return x ? { larghezze: x.riga.larghezze, altezze: x.riga.altezze, perAnta: x.doppia } : null;
}

/** Listini degli accessori validi per la tipologia (oltre a quello della riga, che è la tipologia stessa). */
export function listiniRasomuro(tipologia: string): string[] {
  if (tipologia === TIPOLOGIA_STRIP) return ["RASOMURO_TRASP"];
  const x = trova(tipologia);
  if (!x) return [];
  if (x.apertura.linea === "KIUSO") return ["RASOMURO_LAV", "RASOMURO_TRASP"];
  const scorrevole = x.apertura.cod === "SCE" || x.apertura.cod === "SCI";
  return ["RASOMURO_MYA", scorrevole ? "RASOMURO_MYA_SC" : "RASOMURO_MYA_BPB", ...(x.apertura.cod === "BATT" ? ["RASOMURO_MYA_BATT"] : []), "RASOMURO_LAV", "RASOMURO_TRASP"];
}

/** Breve guida mostrata sotto la riga dell'offerta. */
export function guidaRasomuro(tipologia: string): string | null {
  if (tipologia === TIPOLOGIA_STRIP) return "Prezzo per unità indicata (metro, pezzo o coppia): nella quantità metti i metri o i pezzi.";
  const x = trova(tipologia);
  if (!x) return null;
  const doppia = x.doppia ? " Porta a 2 ante: prezzi già raddoppiati (prezzo 1 anta × 2)." : "";
  if (x.apertura.telaioSenzaAnta) return `Il prezzo della riga è il SOLO telaio: aggiungi l'anta (sovraverniciabile o in finitura).${doppia}`;
  return `Prezzo con telaio, anta sovraverniciabile e accessori di serie: la finitura dell'anta è in aggiunta.${doppia}`;
}

// ---------- dati per il caricamento ----------

export type ProdottoRasomuro = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
export type ModelloRasomuro = { tipologia: string; descrizioneTecnica: string; immagineUrl: string };
export type OptionalRasomuro = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; listino: string; note: string | null };

export function catalogoRasomuro(): { prodotti: ProdottoRasomuro[]; modelli: ModelloRasomuro[]; optional: OptionalRasomuro[] } {
  const prodotti: ProdottoRasomuro[] = [];
  const modelli: ModelloRasomuro[] = [];
  const optional: OptionalRasomuro[] = [];
  for (const x of righeRasomuro()) {
    const { apertura: a, riga: r, doppia, tipologia } = x;
    const k = doppia ? 2 : 1;
    // Misure a 0: prodotto a prezzo fisso (le misure di listino si scelgono nell'offerta e vanno sulla riga).
    const L = 0, H = 0;
    a.telai.forEach((nome, i) => prodotti.push({ tipologia, colore: nome, altezzaMm: H, larghezzaMm: L, prezzoBase: r.telai[i] * k }));
    if (a.telaioSenzaAnta) prodotti.push({ tipologia, colore: "Senza telaio (anta su telaio esistente)", altezzaMm: H, larghezzaMm: L, prezzoBase: 0 });
    const catFin = a.telaioSenzaAnta ? "Anta" : "Finitura anta";
    if (a.telaioSenzaAnta && r.anta) optional.push({ categoria: catFin, nome: "Anta sovraverniciabile", tipoPrezzo: "FISSO", valore: r.anta * k, listino: tipologia, note: null });
    r.finiture.forEach((v, i) => {
      if (v !== null) optional.push({ categoria: catFin, nome: FINITURE_RASOMURO[i], tipoPrezzo: "FISSO", valore: v * k, listino: tipologia, note: null });
    });
    for (const [nome, v] of a.suMisura) optional.push({ categoria: "Su misura", nome, tipoPrezzo: "FISSO", valore: v * k, listino: tipologia, note: null });
    for (const [nome, v] of a.extra) optional.push({ categoria: "Telaio e varianti", nome, tipoPrezzo: "FISSO", valore: v, listino: tipologia, note: null });
    modelli.push({
      tipologia,
      descrizioneTecnica: `${a.descrizione}${doppia ? " Versione a 2 ante: prezzo porta 1 anta × 2." : ""} Misure di listino: ${r.misura}${doppia ? " (per anta)" : ""} cm. Prezzi di vendita.`,
      immagineUrl: `/immagini/rasomuro/${a.foto}`,
    });
  }
  for (const s of STRIP_RASOMURO) prodotti.push({ tipologia: TIPOLOGIA_STRIP, colore: s.nome, altezzaMm: 0, larghezzaMm: 0, prezzoBase: s.prezzo });
  modelli.push({
    tipologia: TIPOLOGIA_STRIP,
    descrizioneTecnica: "STRIP battiscopa filomuro componibile in alluminio, da abbinare alle porte raso muro MYA e alle chiusure KIUSO. Prezzi di vendita per metro, pezzo o coppia.",
    immagineUrl: "/immagini/rasomuro/strip.jpg",
  });
  for (const [listino, voci] of Object.entries(ACCESSORI))
    for (const [categoria, nome, valore] of voci) optional.push({ categoria, nome, tipoPrezzo: "FISSO", valore, listino, note: null });
  optional.push({ categoria: TRASPORTO_PERC[0], nome: TRASPORTO_PERC[1], tipoPrezzo: "PERCENTUALE", valore: TRASPORTO_PERC[2], listino: "RASOMURO_TRASP", note: null });
  return { prodotti, modelli, optional };
}

/** Cataloghi PDF scaricabili (cartella public). */
export const CATALOGHI_RASOMURO = [
  { nome: "Catalogo MYA", url: "/cataloghi/rasomuro/MYA.pdf" },
  { nome: "Catalogo KIUSO", url: "/cataloghi/rasomuro/KIUSO.pdf" },
  { nome: "Catalogo STRIP", url: "/cataloghi/rasomuro/STRIP.pdf" },
  { nome: "Listino Raso Muro", url: "/cataloghi/rasomuro/Listino-Raso-Muro.pdf" },
];
