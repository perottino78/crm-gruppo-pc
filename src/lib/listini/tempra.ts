// Pergola «Tempra» = sistema STABYLA (pergola con copertura a pannelli termici coibentati): prezzi di vendita = listino
// fornitore + 60%. Griglie larghezza × sporgenza (mm) in prisma/seed-data/tempra_prodotti.json (scripts/listini/estrai_tempra.py).
// Modulo puro: lo usano la rotta api/admin/seed-tempra e la pagina dell'offerta.

export const RICARICO_TEMPRA = 1.6;
export const SOTTOGRUPPO_TEMPRA = "Tempra (pannelli coibentati)";
const vendita = (listino: number) => Math.round(listino * RICARICO_TEMPRA * 100) / 100;

type Modello = { nome: string; foto: string; profili: string; sporgenza: number; larghezzaMax: number; altezza: string; carichi?: string };
export const MODELLI_TEMPRA: Record<string, Modello> = {
  A701: { nome: "Tempra base (A701)", foto: "a701.jpg", profili: "travi perimetrali 50×245 mm, travi centrali 50×140 mm (RAL 9010 AD), montanti 155×155 mm", sporgenza: 4500, larghezzaMax: 9846, altezza: "sottotrave 2500 mm, totale 2745 mm" },
  A703: { nome: "Tempra 245 (A703)", foto: "a703.jpg", profili: "travi perimetrali e centrali 50×245 mm verniciate in tinta, montanti 155×155 mm", sporgenza: 4500, larghezzaMax: 9936, altezza: "sottotrave 2500 mm, totale 2745 mm", carichi: "carico neve 120 kg/m², vento 80 kg/m²" },
  A705: { nome: "Tempra Maxy (A705)", foto: "a705.jpg", profili: "travi perimetrali 50×260 mm, travi centrali 50×140 mm (RAL 9010 AD), montanti 155×155 mm", sporgenza: 6000, larghezzaMax: 10048, altezza: "sottotrave 2500 mm, totale 2760 mm" },
  A707: { nome: "Tempra Maxy 260 (A707)", foto: "a707.jpg", profili: "travi perimetrali e centrali 50×260 mm verniciate in tinta, montanti 155×155 mm", sporgenza: 6000, larghezzaMax: 10265, altezza: "sottotrave 2500 mm, totale 2760 mm", carichi: "carico neve 150 kg/m², vento 90 kg/m²" },
};
const INSTALLAZIONE: Record<string, string> = { AD: "Addossata (a parete)", AU: "Autoportante" };

function parti(tipologia: string): { modello: string; inst: string } | null {
  const m = tipologia.match(/^STABYLA_(A70\d)_(AD|AU)$/);
  return m && MODELLI_TEMPRA[m[1]] ? { modello: m[1], inst: m[2] } : null;
}

export function assiSelezioneTempra(tipologia: string) {
  const p = parti(tipologia);
  if (!p) return null;
  return { modello: { valore: p.modello, label: MODELLI_TEMPRA[p.modello].nome }, apertura: { valore: p.inst, label: INSTALLAZIONE[p.inst] } };
}
export function labelTempra(tipologia: string): string | null {
  const a = assiSelezioneTempra(tipologia);
  return a ? `${a.modello.label} — ${a.apertura.label}` : null;
}

export function descrizioneTempra(tipologia: string): string | null {
  const p = parti(tipologia);
  if (!p) return null;
  const m = MODELLI_TEMPRA[p.modello];
  const montanti = p.inst === "AD"
    ? (m.sporgenza > 4500 ? "2 o 3 montanti frontali (4 o 5 oltre 4500 mm di sporgenza)" : "2 montanti frontali fino a 4966 mm di larghezza, 3 oltre")
    : (m.sporgenza > 4500 ? "4 o 6 montanti (6 o 8 oltre 4500 mm di sporgenza)" : "4 montanti fino a 4966 mm di larghezza, 6 oltre");
  return `Pergola Tempra ${INSTALLAZIONE[p.inst].toLowerCase()} in alluminio con copertura a pannelli termici coibentati autoportanti ` +
    `(sp. 52 mm, alluminio 0,7 mm interno/esterno, anima in polistirene estruso 50 mm, R 1,85 m²K/W, 150 kg/m², bianco opaco): più isolante di una veranda tradizionale. ` +
    `Profili: ${m.profili}. ${montanti}. Altezza di serie ${m.altezza}. Dimensioni massime: larghezza ${m.larghezzaMax} mm, sporgenza ${m.sporgenza} mm.` +
    `${m.carichi ? ` Resistenza: ${m.carichi}.` : ""} Nella trave centrale si può integrare illuminazione LED (strip continue o spot). ` +
    `La gronda perimetrale non è integrabile. Prezzo di vendita.`;
}

export type OptionalTempra = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; listino: string };
/** Optional comuni a tutte le Tempra (listino «TEMPRA»): prezzi fornitore + 60% (le percentuali restano tali). */
export function optionalTempra(): OptionalTempra[] {
  const o = (categoria: string, nome: string, listino: number): OptionalTempra => ({ categoria, nome, tipoPrezzo: "FISSO", valore: vendita(listino), listino: "TEMPRA" });
  return [
    { categoria: "Copertura", nome: "Pannello termico sp. 55 mm con filtro acustico 5 mm (R 1,90)", tipoPrezzo: "PERCENTUALE", valore: 3, listino: "TEMPRA" },
    o("Illuminazione LED", "Strip LED white da 5 m (cad.)", 550),
    o("Illuminazione LED", "Strip LED white da 4 m (cad.)", 448),
    o("Illuminazione LED", "Profilo spot LED RGB da 4 m con 3 spot (cad.)", 815),
    o("Illuminazione LED", "Profilo spot LED RGB da 5 m con 4 spot (cad.)", 1066),
    o("Illuminazione LED", "Centralina LED RGB", 352),
  ];
}

export const GUIDA_TEMPRA =
  "Scrivi larghezza e sporgenza in mm: il prezzo è quello della misura di listino uguale o subito superiore. Altezza di serie 2500 mm sottotrave. " +
  "Per le strip/spot conta i metri dei lati (es. 8680×4000: 4 strip da 5 m sui lati lunghi + 2 da 4 m sui corti).";
