// Appuntamenti dal calendario di BConsole (lettura in sola lettura del calendario, «attivita/listCalend»). Modulo puro:
// trasforma un evento BConsole nei dati di un Appuntamento del CRM. Lo usa la rotta api/admin/importa-appuntamenti-bconsole.

export type EventoBC = {
  id: string; title: string; start: string; end?: string | null; assegnato?: string | null; creato_da?: string | null;
  descrizione?: string | null; luogo?: string | null; telefono?: string | null; cell?: string | null; className?: string | null; origineAna?: string | null;
};

export type AppuntamentoBC = {
  chiave: string; account: string; oggetto: string; titolo: string; inizio: Date; durataMin: number; tipo: string; stato: string;
  incaricati: string[]; creatoDa: string | null; luogo: string | null; telefono: string | null; note: string; provenienza: string | null;
};

const pulisci = (s?: string | null) => (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ograve;/g, "ò").replace(/&ugrave;/g, "ù")
  .replace(/&igrave;/g, "ì").replace(/&eacute;/g, "é").replace(/[ \t]+/g, " ").trim();
const nulla = (s?: string | null) => { const t = pulisci(s); return t && t !== "None" ? t : null; };
/** Nome senza accenti/maiuscole e con le parole in ordine, per riconoscere «MARONGIU ROBERTO» = «Roberto Marongiu». */
export const chiaveNome = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/** Nomi degli incaricati, senza l'utenza del centralino «Info P&C» (resta solo se è l'unica). */
export function incaricatiDa(assegnato?: string | null): string[] {
  const nomi = (assegnato ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const veri = nomi.filter((n) => !/^info /i.test(n));
  return veri.length ? veri : nomi;
}

/**
 * Converte un evento; `null` se è un impegno interno (a nome di un collega: «OCCUPATO», colloqui, fiere…) o senza data.
 * `staff` = nomi delle persone dell'azienda (utenti BConsole/CRM).
 */
export function convertiEventoBC(e: EventoBC, staff: string[]): AppuntamentoBC | null {
  const titoloPieno = pulisci(e.title);
  const i = titoloPieno.indexOf(" - ");
  const account = (i > 0 ? titoloPieno.slice(0, i) : titoloPieno).trim();
  const oggetto = (i > 0 ? titoloPieno.slice(i + 3) : "").trim();
  const inizio = new Date(e.start);
  if (!account || isNaN(inizio.getTime())) return null;
  const staffChiavi = new Set(staff.map(chiaveNome));
  if (staffChiavi.has(chiaveNome(account)) || /^info /i.test(account)) return null;
  const fine = e.end ? new Date(e.end) : null;
  const durataMin = fine && !isNaN(fine.getTime()) && fine > inizio ? Math.min(600, Math.round((fine.getTime() - inizio.getTime()) / 60000)) : 60;
  const T = oggetto.toUpperCase();
  const stato = /ANNULLAT|DISDETT/.test(T) ? "ANNULLATO" : e.className === "completata" ? "COMPLETATO" : /CONFERMAT/.test(T) ? "CONFERMATO" : "PROGRAMMATO";
  const tipo = /CHIAMAT|TELEFON|\bCALL\b/.test(T) ? "TELEFONICO" : /SOPRALLUOG|RILIEV/.test(T) ? "SOPRALLUOGO" : /POSA|CONSEGN/.test(T) ? "CONSEGNA" : /FIRMA/.test(T) ? "FIRMA" : "COMMERCIALE";
  const descrizione = nulla(e.descrizione);
  const telefono = nulla(e.telefono) ?? nulla(e.cell);
  const note = [descrizione, `Importato da BConsole (attività n. ${e.id}${e.creato_da ? `, fissato da ${pulisci(e.creato_da)}` : ""}).`].filter(Boolean).join("\n");
  return {
    chiave: `BC|${e.id}`, account, oggetto, titolo: (oggetto || account).slice(0, 200), inizio, durataMin, tipo, stato,
    incaricati: incaricatiDa(e.assegnato), creatoDa: nulla(e.creato_da), luogo: nulla(e.luogo), telefono, note, provenienza: nulla(e.origineAna),
  };
}
