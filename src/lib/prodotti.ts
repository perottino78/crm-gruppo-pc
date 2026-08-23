// Le tipologie delle strutture da esterno (pergole, tende, ombreggianti) usano
// come unità di misura il centimetro nei listini fornitore; i serramenti (Illumia)
// usano il millimetro. altezzaMm/larghezzaMm restano i nomi dei campi a DB per
// compatibilità, ma il valore va interpretato secondo questa unità.
const TIPOLOGIE_IN_CM = ["LUCILLA_", "NUVOLA_"];

export function unitaMisura(tipologia: string): "cm" | "mm" {
  return TIPOLOGIE_IN_CM.some((p) => tipologia.startsWith(p)) ? "cm" : "mm";
}

export function formatDimensioni(tipologia: string, larghezza: number, altezza: number): string {
  return `${larghezza}×${altezza}${unitaMisura(tipologia)}`;
}

export function listinoDiTipologia(tipologia: string): string | null {
  if (tipologia.startsWith("LUCILLA_")) return "LUCILLA";
  if (tipologia.startsWith("NUVOLA_")) return "NUVOLA";
  return null;
}
