import { CodiceFiscaleUtils, type DateMonth, type DateDay } from "@marketto/codice-fiscale-utils";
import { belfioreConnector } from "@marketto/belfiore-connector-embedded";

const cfUtils = new CodiceFiscaleUtils(belfioreConnector);

export type DatiPersonaFisica = {
  cognome: string;
  nome: string;
  sesso: "M" | "F";
  dataNascita: Date;
  comuneNascita: string;
};

/**
 * Calcola il Codice Fiscale italiano a partire dai dati anagrafici di una persona fisica,
 * usando l'algoritmo ufficiale + il connettore Belfiore (comuni italiani ed esteri) incorporato
 * nella libreria @marketto/codice-fiscale-utils. Ritorna null se il comune di nascita non viene
 * riconosciuto o se mancano dati indispensabili.
 */
export async function calcolaCodiceFiscale(dati: DatiPersonaFisica): Promise<string | null> {
  const { cognome, nome, sesso, dataNascita, comuneNascita } = dati;
  if (!cognome?.trim() || !nome?.trim() || !comuneNascita?.trim()) return null;
  if (!(dataNascita instanceof Date) || isNaN(dataNascita.getTime())) return null;

  try {
    // NB: la libreria usa mesi 0-indicizzati come JS Date (0 = Gennaio), quindi NESSUN +1 qui.
    const cf = await cfUtils.parser.encodeCf({
      lastName: cognome.trim(),
      firstName: nome.trim(),
      year: dataNascita.getUTCFullYear(),
      month: dataNascita.getUTCMonth() as DateMonth,
      day: dataNascita.getUTCDate() as DateDay,
      gender: sesso,
      place: comuneNascita.trim(),
    });
    return cf ? cf.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Validazione di formato (non calcolo): 16 caratteri alfanumerici per persona fisica. */
export function formatoCodiceFiscaleValido(cf: string): boolean {
  return /^[A-Za-z]{6}[0-9LMNPQRSTUV]{2}[A-Za-z]{1}[0-9LMNPQRSTUV]{2}[A-Za-z][0-9LMNPQRSTUV]{3}[A-Za-z]$/.test(
    cf.trim()
  );
}

/** Validazione di formato Partita IVA italiana: 11 cifre numeriche. */
export function formatoPivaValido(piva: string): boolean {
  return /^[0-9]{11}$/.test(piva.trim());
}
