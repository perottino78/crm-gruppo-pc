"use server";

// Provvigioni dei commerciali: le inserisce e le liquida l'ufficio fatturazione (o l'amministrazione).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { gestisceProvvigioni } from "@/lib/provvigioni/server";
import { importoProvvigione, cent } from "@/lib/provvigioni/calcoli";
import { daOraRoma } from "@/lib/calendario/tempo";
import { inviaEmailObiettivi, CHIAVE_MAIL_OBIETTIVI } from "@/lib/provvigioni/obiettivi-server";

const numero = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};
// i numeri arrivano dai campi "number" (punto decimale): niente conversione delle migliaia
const numeroCampo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.includes(",") ? numero(v) : Number(s || "NaN");
};

function torna(fd: FormData): string {
  const t = String(fd.get("torna") ?? "");
  return /^\/contratti(\?|$)/.test(t) ? t : "/contratti";
}
const vai = (dove: string, p: Record<string, string>) => {
  const [base, hash] = dove.split("#");
  const url = new URL(base, "http://x");
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  redirect(`${url.pathname}${url.search}${hash ? `#${hash}` : ""}`);
};

async function gestore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u!;
}

/** Inserisce o corregge la provvigione di un contratto (percentuale sull'imponibile). */
export async function salvaProvvigione(fd: FormData) {
  const u = await gestore();
  const dove = torna(fd);
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Le provvigioni le inserisce l'ufficio fatturazione" });
  const contratto = String(fd.get("contratto") ?? "");
  const utenteId = String(fd.get("utenteId") ?? "");
  const base = numeroCampo(fd.get("base"));
  const percentuale = numeroCampo(fd.get("percentuale"));
  if (!/^(C|BC|FV):.+/.test(contratto) || !utenteId) vai(dove, { errore: "Contratto o commerciale mancante" });
  if (!(base >= 0) || !(percentuale >= 0 && percentuale <= 100)) vai(dove, { errore: "Controlla imponibile e percentuale (da 0 a 100)" });
  const importo = importoProvvigione(base, percentuale);
  const esistente = await prisma.provvigione.findUnique({ where: { contratto_utenteId: { contratto, utenteId } }, include: { liquidazioni: true } });
  const liquidato = cent(esistente?.liquidazioni.reduce((s, l) => s + l.importo, 0) ?? 0);
  if (liquidato > importo + 0.005) vai(dove, { errore: `Al commerciale sono già stati liquidati ${liquidato.toFixed(2)} €: la provvigione non può essere più bassa` });
  const dati = {
    base: cent(base), percentuale, importo, note: String(fd.get("note") ?? "").trim() || null,
    clienteNome: String(fd.get("clienteNome") ?? "").trim() || "—", descrizione: String(fd.get("descrizione") ?? "").trim() || null,
    commessaId: contratto.startsWith("C:") ? contratto.slice(2) : null, controllataDa: u.nome, controllataIl: new Date(),
  };
  await prisma.provvigione.upsert({ where: { contratto_utenteId: { contratto, utenteId } }, update: dati, create: { contratto, utenteId, ...dati } });
  // la prima volta che si usa una percentuale per un commerciale diventa la sua abituale
  await prisma.utente.updateMany({ where: { id: utenteId, provvigionePercentuale: null }, data: { provvigionePercentuale: percentuale } });
  revalidatePath("/contratti");
  vai(dove, { ok: `Provvigione salvata: ${percentuale}% di ${cent(base).toFixed(2)} € = ${importo.toFixed(2)} €` });
}

/** Toglie una provvigione inserita per errore (solo se non è stato liquidato nulla). */
export async function eliminaProvvigione(fd: FormData) {
  const u = await gestore();
  const dove = torna(fd);
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Le provvigioni le gestisce l'ufficio fatturazione" });
  const p = await prisma.provvigione.findUnique({ where: { id: String(fd.get("id") ?? "") }, include: { liquidazioni: true } });
  if (!p) vai(dove, { errore: "Provvigione non trovata" });
  if (p!.liquidazioni.length) vai(dove, { errore: "Ci sono già pagamenti al commerciale: annulla prima quelli" });
  await prisma.provvigione.delete({ where: { id: p!.id } });
  revalidatePath("/contratti");
  vai(dove, { ok: "Provvigione tolta: il contratto torna «da controllare»" });
}

/** Registra un pagamento della provvigione al commerciale (anche parziale). */
export async function registraLiquidazione(fd: FormData) {
  const u = await gestore();
  const dove = torna(fd);
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Le provvigioni le liquida l'ufficio fatturazione" });
  const p = await prisma.provvigione.findUnique({ where: { id: String(fd.get("provvigioneId") ?? "") }, include: { liquidazioni: true } });
  if (!p) vai(dove, { errore: "Provvigione non trovata" });
  const importo = cent(numeroCampo(fd.get("importo")));
  const giaPagato = cent(p!.liquidazioni.reduce((s, l) => s + l.importo, 0));
  if (!(importo > 0)) vai(dove, { errore: "Scrivi quanto è stato pagato al commerciale" });
  if (giaPagato + importo > p!.importo + 0.005) vai(dove, { errore: `Si può pagare al massimo ${cent(p!.importo - giaPagato).toFixed(2)} € (resto della provvigione)` });
  const data = daOraRoma(`${String(fd.get("data") ?? "")}T12:00`) ?? new Date();
  await prisma.liquidazioneProvvigione.create({ data: { provvigioneId: p!.id, importo, data, note: String(fd.get("note") ?? "").trim() || null, registrataDa: u.nome } });
  revalidatePath("/contratti");
  vai(dove, { ok: `Pagamento al commerciale registrato: ${importo.toFixed(2)} €` });
}

export async function annullaLiquidazione(fd: FormData) {
  const u = await gestore();
  const dove = torna(fd);
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Le provvigioni le liquida l'ufficio fatturazione" });
  await prisma.liquidazioneProvvigione.deleteMany({ where: { id: String(fd.get("id") ?? "") } });
  revalidatePath("/contratti");
  vai(dove, { ok: "Pagamento al commerciale annullato" });
}

/** Percentuale abituale di un commerciale (proposta quando si controlla un suo contratto). */
export async function salvaPercentualeAbituale(fd: FormData) {
  const u = await gestore();
  const dove = torna(fd);
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Solo l'ufficio fatturazione" });
  const s = String(fd.get("percentuale") ?? "").trim();
  const percentuale = s === "" ? null : numeroCampo(s);
  if (percentuale !== null && !(percentuale >= 0 && percentuale <= 100)) vai(dove, { errore: "Percentuale da 0 a 100" });
  await prisma.utente.update({ where: { id: String(fd.get("utenteId") ?? "") }, data: { provvigionePercentuale: percentuale } });
  revalidatePath("/contratti");
  vai(dove, { ok: "Percentuale abituale salvata" });
}

// ---------- obiettivi e premi ----------

const importo = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? null : numeroCampo(s); };

/** Obiettivo del mese e dell'anno (con premio) di un commerciale. Obiettivo vuoto = tolto. */
export async function salvaObiettiviCommerciale(fd: FormData) {
  const u = await gestore();
  const dove = String(fd.get("torna") ?? "").startsWith("/contratti/obiettivi") ? String(fd.get("torna")) : "/contratti/obiettivi";
  if (!gestisceProvvigioni(u)) vai(dove, { errore: "Gli obiettivi li dà l'amministrazione" });
  const utenteId = String(fd.get("utenteId") ?? "");
  const mese = String(fd.get("mese") ?? ""), anno = String(fd.get("anno") ?? "");
  if (!utenteId || !/^\d{4}-\d{2}$/.test(mese) || !/^\d{4}$/.test(anno)) vai(dove, { errore: "Commerciale o periodo mancante" });
  const note = String(fd.get("note") ?? "").trim() || null;
  for (const [periodo, t, p] of [[mese, "targetMese", "premioMese"], [anno, "targetAnno", "premioAnno"]] as const) {
    const target = importo(fd.get(t)), premio = importo(fd.get(p));
    if (target !== null && !(target >= 0)) vai(dove, { errore: "Obiettivo non valido" });
    if (premio !== null && !(premio >= 0)) vai(dove, { errore: "Premio non valido" });
    if (target === null || target === 0) await prisma.obiettivo.deleteMany({ where: { utenteId, periodo } });
    else await prisma.obiettivo.upsert({
      where: { utenteId_periodo: { utenteId, periodo } },
      update: { importoTarget: cent(target), premio: premio === null ? null : cent(premio), note },
      create: { utenteId, periodo, importoTarget: cent(target), premio: premio === null ? null : cent(premio), note },
    });
  }
  revalidatePath("/contratti");
  vai(`${dove}#u-${utenteId}`, { ok: "Obiettivi salvati" });
}

/** Accende/spegne l'email settimanale degli obiettivi. */
export async function impostaEmailObiettivi(fd: FormData) {
  const u = await gestore();
  if (!gestisceProvvigioni(u)) vai("/contratti/obiettivi", { errore: "Solo l'amministrazione" });
  const valore = fd.get("attiva") === "1" ? "1" : "0";
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE_MAIL_OBIETTIVI }, update: { valore }, create: { chiave: CHIAVE_MAIL_OBIETTIVI, valore } });
  vai("/contratti/obiettivi", { ok: valore === "1" ? "Email del lunedì accesa" : "Email del lunedì spenta" });
}

/** Manda subito il punto della settimana (a tutti o a un commerciale). */
export async function mandaOraEmailObiettivi(fd: FormData) {
  const u = await gestore();
  if (!gestisceProvvigioni(u)) vai("/contratti/obiettivi", { errore: "Solo l'amministrazione" });
  const soloUtenteId = String(fd.get("utenteId") ?? "") || undefined;
  const r = await inviaEmailObiettivi({ forza: true, soloUtenteId });
  if (r.motivo) vai("/contratti/obiettivi", { errore: `Email non partite: ${r.motivo}` });
  vai("/contratti/obiettivi", r.errori.length
    ? { errore: `Inviate ${r.inviate}; problemi: ${r.errori.join("; ")}` }
    : { ok: r.inviate ? `Email mandate: ${r.inviate}${r.saltate ? ` (${r.saltate} senza email)` : ""}` : "Nessuno con un obiettivo del mese o dell'anno in corso" });
}
