"use server";

// Pagamenti e incassi registrati a mano dallo scadenzario, dalle fatture d'acquisto e da quelle di vendita:
// banca, metodo, data, importo (totale o parziale), commissione bancaria e ritenuta 11% sui bonifici per detrazione.
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { leggiImporto } from "@/lib/amministrazione/estratto";
import { utenteAmministrazione, registra, eMeseChiuso, ricalcolaScadenza, residuoScadenza } from "@/lib/amministrazione/server";
import { eur, dataIt as giorno } from "@/lib/amministrazione/costanti";
import { controllaPagamento, nomeMetodo, METODI_PAGAMENTO } from "@/lib/amministrazione/pagamenti";
import { praticaDiIncasso, avanzaDopoIncasso } from "@/app/flusso-actions";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const num = (fd: FormData, k: string) => leggiImporto(str(fd, k)) ?? 0;
const cent = (n: number) => Math.round(n * 100) / 100;
const dataDa = (fd: FormData, k: string) => { const v = str(fd, k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : null; };

function torna(ritorno: string | null, p: Record<string, string>): never {
  const dove = ritorno && ritorno.startsWith("/") ? ritorno : "/amministrazione/scadenzario";
  const [base, q] = dove.split("?");
  const u = new URLSearchParams(q);
  u.delete("ok"); u.delete("errore");
  for (const [k, v] of Object.entries(p)) u.set(k, v);
  redirect(`${base}?${u}`);
}
const aggiorna = () => revalidatePath("/amministrazione", "layout");

/** Registra un pagamento (o incasso) su una scadenza: movimento sulla banca, commissione a parte, ritenuta. */
export async function registraPagamento(fd: FormData) {
  const u = await utenteAmministrazione();
  const ritorno = str(fd, "ritorno");
  if (!u) torna(ritorno, { errore: "Non autorizzato." });
  const s = await prisma.scadenza.findUnique({ where: { id: str(fd, "scadenzaId") ?? "" }, include: { abbinamenti: true } });
  if (!s || s.stato === "ANNULLATA") torna(ritorno, { errore: "Scadenza non trovata o annullata." });
  const incasso = s!.tipo === "INCASSO";
  const data = dataDa(fd, "data") ?? new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const metodo = str(fd, "metodo");
  if (!metodo || !METODI_PAGAMENTO.some((m) => m.chiave === metodo)) torna(ritorno, { errore: "Scegli come è stato pagato." });
  const importo = cent(num(fd, "importo"));
  const ritenuta = incasso ? cent(num(fd, "ritenuta")) : 0;
  const commissione = cent(num(fd, "commissione"));
  const residuo = residuoScadenza(s!);
  const errore = controllaPagamento({ importo, ritenuta, commissione, residuo });
  if (errore) torna(ritorno, { errore });
  if (await eMeseChiuso(data)) torna(ritorno, { errore: `Il mese di ${giorno(data)} è chiuso: riaprilo dalla Prima nota o usa un'altra data.` });
  const conto = importo > 0 ? await prisma.contoFinanziario.findFirst({ where: { id: str(fd, "contoId") ?? "", attivo: true } }) : null;
  if (importo > 0 && !conto) torna(ritorno, { errore: "Scegli la banca (o la cassa) su cui è passato il pagamento." });

  const descr = `${incasso ? "Incasso" : "Pagamento"} ${s!.controparte} · ${s!.descrizione}${s!.numeroDocumento ? ` · doc. ${s!.numeroDocumento}` : ""}`.slice(0, 480);
  // sui conti in banca il pagamento resta "da confermare" finché l'estratto conto non lo ritrova
  const daConfermare = !!conto && conto.tipo !== "CASSA";
  await prisma.$transaction(async (tx) => {
    let movId: string | null = null;
    if (importo > 0 && conto) {
      const m = await tx.movimentoFinanziario.create({
        data: {
          contoId: conto.id, data, importo: incasso ? importo : -importo, descrizione: descr, origine: "MANUALE", impronta: `PAG-${randomUUID()}`,
          stato: "ABBINATO", metodo, daConfermare, divisione: s!.brand ?? conto.divisione, note: str(fd, "note"), ritenuta, creatoDaNome: u!.nome,
        },
      });
      movId = m.id;
      await tx.abbinamentoScadenza.create({ data: { movimentoId: m.id, scadenzaId: s!.id, importo, creatoDaNome: u!.nome } });
      if (commissione > 0) {
        await tx.movimentoFinanziario.create({
          data: {
            contoId: conto.id, data, importo: -commissione, descrizione: `Commissione ${nomeMetodo(metodo).toLowerCase()} — ${s!.controparte}`.slice(0, 480),
            origine: "MANUALE", impronta: `COM-${randomUUID()}`, stato: "REGISTRATO", categoria: "Commissioni e spese bancarie", metodo, daConfermare,
            divisione: s!.brand ?? conto.divisione, commissioneDiId: m.id, creatoDaNome: u!.nome,
          },
        });
      }
    }
    if (ritenuta > 0) {
      await tx.scadenza.update({
        where: { id: s!.id },
        data: { ritenuta: cent(s!.ritenuta + ritenuta), note: [s!.note, `Ritenuta 11% trattenuta dalla banca: ${eur(ritenuta)} (${giorno(data)})${movId ? "" : " — registrata senza movimento"}`].filter(Boolean).join("\n") },
      });
    }
  });
  await ricalcolaScadenza(s!.id);
  // incasso di una pratica: la trafila dei task va avanti da sola (acconto → ufficio successivo, saldo → posa)
  const pratica = incasso ? await praticaDiIncasso(s!.id) : null;
  const avanzate = pratica ? await avanzaDopoIncasso(pratica, data) : [];
  const testo = `${incasso ? "Incasso" : "Pagamento"} ${eur(importo)}${ritenuta ? ` + ritenuta ${eur(ritenuta)}` : ""} · ${nomeMetodo(metodo)}${conto ? ` · ${conto.nome}` : ""} · ${giorno(data)}${commissione ? ` · commissione ${eur(commissione)}` : ""}`;
  await registra("Scadenza", s!.id, incasso ? "Incasso registrato" : "Pagamento registrato", `${s!.controparte} · ${s!.descrizione} — ${testo}`, u!.nome);
  aggiorna();
  revalidatePath("/commesse/[id]", "page");
  torna(ritorno, { ok: `${testo}. ${residuo - importo - ritenuta > 0.004 ? `Resta da saldare ${eur(cent(residuo - importo - ritenuta))}.` : "Scadenza saldata."}${avanzate.length ? ` Pratica avanzata: chiusa la fase «${avanzate.join("», «")}», task all'ufficio successivo.` : ""}` });
}

/** Annulla un pagamento registrato a mano (sbagliato): solo se l'estratto conto non l'ha ancora confermato e il mese è aperto. */
export async function annullaPagamento(fd: FormData) {
  const u = await utenteAmministrazione();
  const ritorno = str(fd, "ritorno");
  if (!u) torna(ritorno, { errore: "Non autorizzato." });
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id: str(fd, "movimentoId") ?? "" }, include: { abbinamenti: true } });
  if (!m || m.origine !== "MANUALE" || !m.metodo || m.commissioneDiId) torna(ritorno, { errore: "Pagamento non trovato." });
  if (m!.confermatoIl) torna(ritorno, { errore: "Il pagamento è già confermato dall'estratto conto: per correggerlo scollegalo dalla Prima nota." });
  if (await eMeseChiuso(m!.data)) torna(ritorno, { errore: "Il mese del pagamento è chiuso." });
  const scadenze = m!.abbinamenti.map((a) => a.scadenzaId);
  await prisma.$transaction(async (tx) => {
    await tx.abbinamentoScadenza.deleteMany({ where: { movimentoId: m!.id } });
    if (m!.ritenuta > 0 && scadenze[0]) {
      const s = await tx.scadenza.findUniqueOrThrow({ where: { id: scadenze[0] } });
      await tx.scadenza.update({ where: { id: s.id }, data: { ritenuta: Math.max(0, cent(s.ritenuta - m!.ritenuta)), note: [s.note, `Ritenuta ${eur(m!.ritenuta)} annullata con il pagamento`].filter(Boolean).join("\n") } });
    }
    await tx.movimentoFinanziario.deleteMany({ where: { commissioneDiId: m!.id } });
    await tx.movimentoFinanziario.delete({ where: { id: m!.id } });
  });
  for (const id of scadenze) await ricalcolaScadenza(id);
  await registra("Movimento", m!.id, "Pagamento annullato", `${giorno(m!.data)} ${eur(m!.importo)} «${m!.descrizione.slice(0, 80)}»`, u!.nome);
  aggiorna();
  torna(ritorno, { ok: "Pagamento annullato: la scadenza è tornata da saldare." });
}
