// Le tipologie delle strutture da esterno (pergole, tende, ombreggianti) usano
// come unità di misura il centimetro nei listini fornitore; i serramenti (Illumia)
// usano il millimetro. altezzaMm/larghezzaMm restano i nomi dei campi a DB per
// compatibilità, ma il valore va interpretato secondo questa unità.
const TIPOLOGIE_IN_CM = ["LUCILLA_", "NUVOLA_", "PANAREA_", "COMPSFUSI_", "WAWE_", "SOLARIA_", "RAINCOVER_", "ISCHIA_", "GIARDINO_PONZA", "CORFU_", "GIARDINO94_", "STANDARD35_", "GRADINI35", "PROLUNGATA35", "STANDARD50_", "GRADINI50", "PROLUNGATA50", "VOGUE", "DELTA_K35", "DELTA_K50", "BETA1002", "BETA1003", "BARLETTA", "CUPOLA", "TENDACADUTA_", "TELAIFISSI_", "TENDABRACCI_", "TENDAORIZZ_", "TENDABRACCICASS_", "TENDAVERANDA_"];

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
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_SENZACASS")) return "TENDACADUTA_3000CAVETTO_SENZACASS";
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_ROUND")) return "TENDACADUTA_3000CAVETTO_ROUND";
  if (tipologia.startsWith("TENDACADUTA_3000CAVETTO_TONDINOROUND")) return "TENDACADUTA_3000CAVETTO_TONDINOROUND";
  if (tipologia.startsWith("TENDACADUTA_3000GUIDE")) return "TENDACADUTA_3000GUIDE";
  if (tipologia.startsWith("TENDACADUTA_3000")) return "TENDACADUTA_3000";
  if (tipologia.startsWith("TENDACADUTA_5000S")) return "TENDACADUTA_5000S";
  if (tipologia.startsWith("TENDACADUTA_7000T")) return "TENDACADUTA_7000T";
  if (tipologia.startsWith("TENDACADUTA_7000E")) return "TENDACADUTA_7000E";
  if (tipologia.startsWith("TENDACADUTA_T4")) return "TENDACADUTA_T4";
  if (tipologia.startsWith("TENDACADUTA_ORIZZONTE")) return "TENDACADUTA_ORIZZONTE";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_CRISTAL")) return "TENDACADUTA_EVOZIP125_CRISTAL";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_SCREEN")) return "TENDACADUTA_EVOZIP125_SCREEN";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP125_OPATEX")) return "TENDACADUTA_EVOZIP125_OPATEX";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP100_SCREEN")) return "TENDACADUTA_EVOZIP100_SCREEN";
  if (tipologia.startsWith("TENDACADUTA_EVOZIP100_OPATEX")) return "TENDACADUTA_EVOZIP100_OPATEX";
  if (tipologia.startsWith("TELAIFISSI_ACRILICO_ORIZZ")) return "TELAIFISSI_ACRILICO_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_ACRILICO_VERT")) return "TELAIFISSI_ACRILICO_VERT";
  if (tipologia.startsWith("TELAIFISSI_PRECONTRAINT302_ORIZZ")) return "TELAIFISSI_PRECONTRAINT302_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_PRECONTRAINT302_VERT")) return "TELAIFISSI_PRECONTRAINT302_VERT";
  if (tipologia.startsWith("TELAIFISSI_CRISTAL500_ORIZZ")) return "TELAIFISSI_CRISTAL500_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_CRISTAL500_VERT")) return "TELAIFISSI_CRISTAL500_VERT";
  if (tipologia.startsWith("TELAIFISSI_VINITEX2102_ORIZZ")) return "TELAIFISSI_VINITEX2102_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_VINITEX9X9_ORIZZ")) return "TELAIFISSI_VINITEX9X9_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_SOLTIS92_ORIZZ")) return "TELAIFISSI_SOLTIS92_ORIZZ";
  if (tipologia.startsWith("TELAIFISSI_SOLTIS92_VERT")) return "TELAIFISSI_SOLTIS92_VERT";
  if (tipologia.startsWith("TELAIFISSI_POLICARBONATO")) return "TELAIFISSI_POLICARBONATO";
  if (tipologia.startsWith("TENDABRACCI_BILBAO")) return "TENDABRACCI_BILBAO";
  if (tipologia.startsWith("TENDABRACCI_MADRID")) return "TENDABRACCI_MADRID";
  if (tipologia.startsWith("TENDABRACCI_PANAMA")) return "TENDABRACCI_PANAMA";
  if (tipologia.startsWith("TENDABRACCI_SAMBASMART")) return "TENDABRACCI_SAMBASMART";
  if (tipologia.startsWith("TENDABRACCI_SAMBA")) return "TENDABRACCI_SAMBA";
  if (tipologia.startsWith("TENDABRACCI_AMERICA")) return "TENDABRACCI_AMERICA";
  if (tipologia.startsWith("TENDAORIZZ_MILLENIUM")) return "TENDAORIZZ_MILLENIUM";
  if (tipologia.startsWith("TENDAORIZZ_TENDAROLL_SENZACASSONETTO")) return "TENDAORIZZ_TENDAROLL_SENZACASSONETTO";
  if (tipologia.startsWith("TENDAORIZZ_TENDAROLL_CONCASSONETTO")) return "TENDAORIZZ_TENDAROLL_CONCASSONETTO";
  if (tipologia.startsWith("TENDABRACCICASS_CARAIBISMART")) return "TENDABRACCICASS_CARAIBISMART";
  if (tipologia.startsWith("TENDABRACCICASS_CARAIBI")) return "TENDABRACCICASS_CARAIBI";
  if (tipologia.startsWith("TENDABRACCICASS_COVER400")) return "TENDABRACCICASS_COVER400";
  if (tipologia.startsWith("TENDABRACCICASS_EUROPA")) return "TENDABRACCICASS_EUROPA";
  if (tipologia.startsWith("TENDABRACCICASS_HAWAII")) return "TENDABRACCICASS_HAWAII";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_TOP_FRANGIVENTO")) return "TENDAVERANDA_WINTERBALKON_TOP_FRANGIVENTO";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_FRANGIVENTO")) return "TENDAVERANDA_WINTERBALKON_FRANGIVENTO";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON_TOP")) return "TENDAVERANDA_WINTERBALKON_TOP";
  if (tipologia.startsWith("TENDAVERANDA_WINTERBALKON")) return "TENDAVERANDA_WINTERBALKON";
  return null;
}

export function etichetteDimensioni(tipologia: string): { larghezza: string; altezza: string } {
  if (unitaMisura(tipologia) === "cm") return { larghezza: "Larghezza", altezza: "Sporgenza" };
  return { larghezza: "Larghezza", altezza: "Altezza" };
}

export function haMisura(larghezza: number, altezza: number): boolean {
  return larghezza > 0 || altezza > 0;
}
