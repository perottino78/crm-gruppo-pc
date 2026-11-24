// Informativa privacy pubblica (/privacy): lettura del testo salvato in Impostazioni (o quello di partenza).
import { getConfig } from "@/lib/leadIngest";
import { CHIAVE_INFORMATIVA, CHIAVE_INFORMATIVA_DATA, INFORMATIVA_PREDEFINITA, VERSIONE_PREDEFINITA } from "./testi";

export * from "./testi";

export async function leggiInformativa(): Promise<{ testo: string; versione: string; personalizzata: boolean }> {
  const t = (await getConfig(CHIAVE_INFORMATIVA))?.trim();
  if (!t) return { testo: INFORMATIVA_PREDEFINITA, versione: VERSIONE_PREDEFINITA, personalizzata: false };
  return { testo: t, versione: (await getConfig(CHIAVE_INFORMATIVA_DATA)) || VERSIONE_PREDEFINITA, personalizzata: true };
}

