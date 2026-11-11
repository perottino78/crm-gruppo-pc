// Obiettivi e premi dei commerciali (lato server): lettura degli obiettivi e email settimanale «sei in linea?».
import { prisma } from "@/lib/prisma";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { contrattiDi } from "./server";
import { avanzamento, emailSettimanale, periodoAnno, periodoMese, settimanaIso, vendutoNelPeriodo } from "./obiettivi";

export const CHIAVE_MAIL_OBIETTIVI = "obiettivi_mail_attiva";
export const CHIAVE_ULTIMA_MAIL_OBIETTIVI = "obiettivi_mail_settimana";

/** Obiettivo del mese e dell'anno in corso di un commerciale, con la tabella di marcia. */
export async function obiettiviDi(utenteId: string, contratti: { data: Date | null; imponibile: number }[], oggi = chiaveGiorno(new Date())) {
  const mese = periodoMese(oggi), anno = periodoAnno(oggi);
  const righe = await prisma.obiettivo.findMany({ where: { utenteId, periodo: { in: [mese, anno] } } });
  const di = (periodo: string) => {
    const o = righe.find((x) => x.periodo === periodo);
    return o && o.importoTarget > 0 ? { periodo, premio: o.premio, note: o.note, av: avanzamento(o.importoTarget, vendutoNelPeriodo(contratti, periodo), periodo, oggi) } : null;
  };
  return { oggi, mese: di(mese), anno: di(anno) };
}

/** L'email settimanale si può spegnere in Obiettivi e premi (di serie è accesa: parte solo a chi ha un obiettivo). */
export async function emailObiettiviAttiva(): Promise<boolean> {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_MAIL_OBIETTIVI } });
  return c?.valore !== "0";
}

/**
 * Email della settimana a ogni commerciale attivo con un obiettivo del mese o dell'anno in corso. Parte dal lunedì
 * (una volta per settimana: la settimana si segna prima di spedire). `forza` = «manda adesso» dall'amministrazione.
 */
export async function inviaEmailObiettivi(opz: { adesso?: Date; forza?: boolean; soloUtenteId?: string } = {}) {
  const ora = opz.adesso ?? new Date();
  const oggi = chiaveGiorno(ora);
  const r = { inviate: 0, saltate: 0, errori: [] as string[], motivo: undefined as string | undefined };
  if (!opz.forza) {
    if (!(await emailObiettiviAttiva())) return { ...r, motivo: "email degli obiettivi spenta" };
    const sett = settimanaIso(oggi);
    // nel fine settimana non si manda: il punto arriva il lunedì (o il primo controllo dopo)
    const dow = new Date(`${oggi}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) return { ...r, motivo: "fine settimana" };
    const segnata = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_ULTIMA_MAIL_OBIETTIVI } });
    if (segnata?.valore === sett) return { ...r, motivo: "già mandata questa settimana" };
    await prisma.configurazione.upsert({ where: { chiave: CHIAVE_ULTIMA_MAIL_OBIETTIVI }, update: { valore: sett }, create: { chiave: CHIAVE_ULTIMA_MAIL_OBIETTIVI, valore: sett } });
  }
  if (!(await mailConfigurata())) return { ...r, motivo: "posta non configurata" };
  const periodi = [periodoMese(oggi), periodoAnno(oggi)];
  const conObiettivo = await prisma.obiettivo.findMany({
    where: { periodo: { in: periodi }, importoTarget: { gt: 0 }, ...(opz.soloUtenteId ? { utenteId: opz.soloUtenteId } : {}), utente: { stato: "ATTIVO" } },
    select: { utente: { select: { id: true, nome: true, username: true, email: true } } },
  });
  const persone = [...new Map(conObiettivo.map((o) => [o.utente.id, o.utente])).values()];
  for (const p of persone) {
    if (!p.email) { r.saltate++; continue; }
    const contratti = await contrattiDi([p]);
    const ob = await obiettiviDi(p.id, contratti, oggi);
    const mail = emailSettimanale({ nome: p.nome, oggi, mese: ob.mese, anno: ob.anno, link: `${APP_URL}/contratti` });
    if (!mail) { r.saltate++; continue; }
    const esito = await inviaMail({ a: [p.email], oggetto: mail.oggetto, testo: mail.testo });
    if (esito.inviata) r.inviate++; else r.errori.push(`${p.nome}: ${esito.motivo ?? "non inviata"}`);
  }
  return r;
}
