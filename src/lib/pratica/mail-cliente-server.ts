// Invio delle mail al cliente lungo la pratica: parte dalla casella del responsabile (come le email di fase), non blocca mai il lavoro
// e lascia traccia nello storico della pratica.
import { prisma } from "@/lib/prisma";
import { inviaMail } from "@/lib/mail/invio";
import { numeroCommessa } from "@/lib/commesse";
import { mailRingraziamentoPagamento, type DatiMailPratica, type MailPratica } from "./mail-cliente";

export async function inviaMailPratica(commessaId: string, titolo: string, costruisci: (d: DatiMailPratica) => MailPratica): Promise<boolean> {
  try {
    const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: { select: { nome: true, email: true } }, responsabile: { select: { id: true, nome: true, email: true, telefono: true } } } });
    if (!c) return false;
    const m = costruisci({ cliente: c.cliente.nome, numero: numeroCommessa(c), commerciale: c.responsabile?.nome ?? null, telefono: c.responsabile?.telefono ?? null });
    const esito = await inviaMail({ a: c.cliente.email ? [c.cliente.email] : [], oggetto: m.oggetto, testo: m.testo, rispondiA: c.responsabile?.email, daUtenteId: c.responsabile?.id ?? null });
    await prisma.commessaEvento.create({ data: { commessaId, utenteNome: "Automatico", testo: esito.inviata ? `Mail al cliente (${titolo}): inviata a ${c.cliente.email}.` : `Mail al cliente (${titolo}) non inviata: ${esito.motivo ?? "email del cliente mancante"}.` } });
    return esito.inviata;
  } catch (e) {
    console.error("inviaMailPratica", titolo, e);
    return false;
  }
}

/** Ringraziamento al cliente alla prima registrazione dell'acconto incassato: una sola volta per pratica. */
export async function ringraziaPagamentoAcconto(commessaId: string): Promise<void> {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, select: { ringraziamentoInviatoIl: true } });
  if (!c || c.ringraziamentoInviatoIl) return;
  // si segna prima: due incassi quasi insieme non mandano due mail
  const preso = await prisma.commessa.updateMany({ where: { id: commessaId, ringraziamentoInviatoIl: null }, data: { ringraziamentoInviatoIl: new Date() } });
  if (preso.count !== 1) return;
  const inviata = await inviaMailPratica(commessaId, "ringraziamento per il pagamento", mailRingraziamentoPagamento);
  if (!inviata) await prisma.commessa.update({ where: { id: commessaId }, data: { ringraziamentoInviatoIl: null } }).catch(() => undefined);
}

/**
 * Per conoscenza al commerciale della pratica (richiesta di Ugo, 17/11/2026): quando si fissa il rilievo o la posa riceve un task
 * e una mail con cosa è stato fissato. Mai bloccante.
 */
export async function avvisaCommerciale(commessaId: string, titolo: string, testo: string): Promise<void> {
  try {
    const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: { select: { nome: true } }, responsabile: { select: { id: true, nome: true, email: true } } } });
    if (!c?.responsabile) return;
    const t = `${titolo} · ${c.cliente.nome}`;
    await prisma.taskPratica.create({ data: { commessaId, faseChiave: null, titolo: t, descrizione: `${testo}\n(Per conoscenza: nessuna azione richiesta.)`, ufficio: "COMMERCIALE", assegnatoUtenteId: c.responsabile.id, assegnatoNome: c.responsabile.nome, creatoDa: "Automatico" } });
    if (c.responsabile.email) {
      const link = `${process.env.APP_URL || "https://crm-gruppo-pc.vercel.app"}/commesse/${commessaId}`;
      await inviaMail({ a: [c.responsabile.email], oggetto: `[CRM P&C] ${t}`, testo: `Ciao ${c.responsabile.nome.split(" ")[0]},\n\n${testo}\n\nPer conoscenza, nessuna azione richiesta. Apri la pratica: ${link}` });
    }
  } catch (e) {
    console.error("avvisaCommerciale", titolo, e);
  }
}
