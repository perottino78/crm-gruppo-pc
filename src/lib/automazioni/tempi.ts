// Regole dei tempi del percorso lead, riprese da Keap (vedi docs del progetto "crm-interno"):
// - solleciti e attese: almeno N×24 ore, poi la prima finestra lun–sab alle 08:00 (ora di Roma);
// - i task automatici chiudono alle 18:30: chi arriva dalle 18:30 in poi va al giorno dopo;
// - ricontatto concordato: R, R+1, R+2 allo stesso orario, timeout a R+20.
// Funzioni pure: testabili senza database.
import { partiRoma, chiaveGiorno, aggiungiGiorni, giornoSettimana, daOraRoma } from "@/lib/calendario/tempo";

const ORA = 3600 * 1000;
const giornoLavorativo = (chiave: string, conSabato = true) => giornoSettimana(chiave) <= (conSabato ? 6 : 5);

/** Prima finestra consentita (giorno lun–sab, alle 08:00 di Roma) che non sia prima di `minimo`. */
export function primaFinestra08(minimo: Date, conSabato = true): Date {
  let chiave = chiaveGiorno(minimo);
  for (let i = 0; i < 10; i++) {
    const t = daOraRoma(`${chiave}T08:00`)!;
    if (giornoLavorativo(chiave, conSabato) && t.getTime() >= minimo.getTime()) return t;
    chiave = aggiungiGiorni(chiave, 1);
  }
  return daOraRoma(`${chiave}T08:00`)!;
}

/** Attesa di almeno N giorni (N×24 ore) e poi la prima finestra lun–sab alle 08:00. Venerdì 11:00 + 1 → lunedì 08:00. */
export function dopoGiorniAlle08(da: Date, giorni: number, conSabato = true): Date {
  return primaFinestra08(new Date(da.getTime() + giorni * 24 * ORA), conSabato);
}

/** Il giorno lavorativo (lun–sab) successivo a `da`, alle 08:00: per le lettere, una al giorno. */
export function giornoDopoAlle08(da: Date): Date {
  return primaFinestra08(daOraRoma(`${aggiungiGiorni(chiaveGiorno(da), 1)}T00:00`)!);
}

/** Recupero: stesso giorno N mesi dopo (fine mese limitata, es. 31/08 + 3 → 30/11), poi il primo giorno lun–ven alle 10:00. */
export function dopoMesiAlle10(da: Date, mesi: number): Date {
  const [y, m, g] = chiaveGiorno(da).split("-").map(Number);
  const totale = m - 1 + mesi;
  const anno = y + Math.floor(totale / 12);
  const mese = (totale % 12) + 1;
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  let chiave = `${anno}-${String(mese).padStart(2, "0")}-${String(Math.min(g, ultimo)).padStart(2, "0")}`;
  while (giornoSettimana(chiave) > 5) chiave = aggiungiGiorni(chiave, 1);
  return daOraRoma(`${chiave}T10:00`)!;
}

/** "Oggi", "Ieri", "N giorni fa" dalla data reale di invio (ora di Roma). */
export function giorniFa(quando: Date, adesso: Date): string {
  const giorni = Math.round((Date.parse(chiaveGiorno(adesso)) - Date.parse(chiaveGiorno(quando))) / 86400000);
  return giorni <= 0 ? "Oggi" : giorni === 1 ? "Ieri" : `${giorni} giorni fa`;
}

/** Scadenza di un task automatico: le 18:30 di oggi, o di domani se è già passata quell'ora. */
export function chiusuraGiornata(creato: Date): Date {
  const p = partiRoma(creato);
  const oggi = chiaveGiorno(creato);
  const dopo = p.ora > 18 || (p.ora === 18 && p.minuto >= 30);
  return daOraRoma(`${dopo ? aggiungiGiorni(oggi, 1) : oggi}T18:30`)!;
}

/** "Non risponde": nuovo tentativo nel primo giorno lun–sab dopo almeno 24 ore, entro le 18:30 di quel giorno. */
export function scadenzaNuovoTentativo(da: Date): Date {
  const giorno = chiaveGiorno(dopoGiorniAlle08(da, 1));
  return daOraRoma(`${giorno}T18:30`)!;
}

/** Stesso orario italiano N giorni di calendario dopo (per R+1, R+2, R+20). */
export function stessaOraFra(r: Date, giorni: number): Date {
  const p = partiRoma(r);
  const due = (n: number) => String(n).padStart(2, "0");
  return daOraRoma(`${aggiungiGiorni(chiaveGiorno(r), giorni)}T${due(p.ora)}:${due(p.minuto)}`)!;
}

/** Un invio rimasto indietro di oltre 24 ore non parte da solo: va controllato (niente raffiche di email vecchie). */
export const RITARDO_MASSIMO_MS = 24 * ORA;
export const troppoInRitardo = (previsto: Date, adesso: Date) => adesso.getTime() - previsto.getTime() > RITARDO_MASSIMO_MS;
