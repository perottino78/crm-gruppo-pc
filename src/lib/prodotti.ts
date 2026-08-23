// Le tipologie delle strutture da esterno (pergole, tende, ombreggianti) usano
// come unità di misura il centimetro nei listini fornitore; i serramenti (Illumia)
// usano il millimetro. altezzaMm/larghezzaMm restano i nomi dei campi a DB per
// compatibilità, ma il valore va interpretato secondo questa unità.
const TIPOLOGIE_IN_CM = ["LUCILLA_", "NUVOLA_", "PANAREA_", "COMPSFUSI_", "WAWE_", "SOLARIA_", "RAINCOVER_", "ISCHIA_", "GIARDINO_PONZA", "CORFU_", "GIARDINO94_", "STANDARD35_", "GRADINI35", "PROLUNGATA35", "STANDARD50_", "GRADINI50", "PROLUNGATA50", "VOGUE", "DELTA_K35", "DELTA_K50", "BETA1002", "BETA1003", "BARLETTA", "CUPOLA"];

export function unitaMisura(tipologia: string): "cm" | "mm" {
  return TIPOLOGIE_IN_CM.some((p) => tipologia.startsWith(p)) ? "cm" : "mm";
}

export function formatDimensioni(tipologia: string, larghezza: number, altezza: number): string {
  return `${larghezza}×${altezza}${unitaMisura(tipologia)}`;
}

export function listinoDiTipologia(tipologia: string): string | null {
  if (tipologia.startsWith("LUCILLA_")) return "LUCILLA";
  if (tipologia.startsWith("NUVOLA_")) return "NUVOLA";
  if (tipologia.startsWith("PANAREA_")) return "PANAREA";
  if (tipologia.startsWith("WAWE_")) return "WAWE";
  if (tipologia.startsWith("SOLARIA_")) return "SOLARIA";
  if (tipologia.startsWith("RAINCOVER_")) return "RAINCOVER";
  if (tipologia.startsWith("ISCHIA_")) return "AURORA";
  if (tipologia.startsWith("GIARDINO_PONZA")) return "GIARDINO_PONZA";
  if (tipologia.startsWith("CORFU_")) return "CORFU";
  if (tipologia.startsWith("GIARDINO94_")) return "GIARDINO94";
  if (tipologia.startsWith("STANDARD35_")) return "STANDARD35";
  if (tipologia.startsWith("GRADINI35")) return "GRADINI35";
  if (tipologia.startsWith("PROLUNGATA35")) return "PROLUNGATA35";
  if (tipologia.startsWith("STANDARD50_")) return "STANDARD50";
  if (tipologia.startsWith("GRADINI50")) return "GRADINI50";
  if (tipologia.startsWith("PROLUNGATA50")) return "PROLUNGATA50";
  if (tipologia.startsWith("VOGUE")) return "VOGUE";
  if (tipologia.startsWith("DELTA_K35")) return "DELTA_K35";
  if (tipologia.startsWith("DELTA_K50")) return "DELTA_K50";
  if (tipologia.startsWith("BETA1002")) return "BETA1002";
  if (tipologia.startsWith("BETA1003")) return "BETA1003";
  if (tipologia.startsWith("BARLETTA")) return "BARLETTA";
  if (tipologia.startsWith("CUPOLA")) return "CUPOLA";
  return null;
}

export function etichetteDimensioni(tipologia: string): { larghezza: string; altezza: string } {
  if (unitaMisura(tipologia) === "cm") return { larghezza: "Larghezza", altezza: "Sporgenza" };
  return { larghezza: "Larghezza", altezza: "Altezza" };
}

export function haMisura(larghezza: number, altezza: number): boolean {
  return larghezza > 0 || altezza > 0;
}
