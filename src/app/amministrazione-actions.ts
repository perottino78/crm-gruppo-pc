"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { leggiEstratto, leggiImporto, improntePer, cent, giorno } from "@/lib/amministrazione/estratto";
import { leggiPrimaNotaFoglio, descrizioneRiga, categoriaDaFoglio } from "@/lib/amministrazione/foglio";
import { createHash } from "crypto";
import { suggerisci } from "@/lib/amministrazione/abbinamento";
import {
  utenteAmministrazione, registra, eMeseChiuso, mesiChiusi, meseDi, saldoConto,
  ricalcolaScadenza, ricalcolaMovimento, residuoScadenza, residuoMovimento,
} from "@/lib/amministrazione/server";
import { eur } from "@/lib/amministrazione/costanti";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function num(fd: FormData, k: string): number | null {
  return leggiImporto(str(fd, k));
}
function dataDa(fd: FormData, k: string): Date | null {
  const v = str(fd, k);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T12:00:00Z`);
}
const aggiorna = () => revalidatePath("/amministrazione", "layout");

// ======================= CONTI =======================

export async function salvaConto(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  const nome = str(fd, "nome");
  const dataSaldo = dataDa(fd, "dataSaldoIniziale");
  if (!nome || !dataSaldo) return;
  const dati = {
    nome,
    tipo: str(fd, "tipo") ?? "BANCA",
    banca: str(fd, "banca"),
    iban: str(fd, "iban")?.replace(/\s/g, "").toUpperCase() ?? null,
    saldoIniziale: cent(num(fd, "saldoIniziale") ?? 0),
    dataSaldoIniziale: dataSaldo,
    fido: cent(num(fd, "fido") ?? 0),
    ordine: Math.round(num(fd, "ordine") ?? 0),
    divisione: str(fd, "divisione"),
    attivo: fd.get("attivo") !== "no",
  };
  if (id) {
    const prima = await prisma.contoFinanziario.findUnique({ where: { id } });
    await prisma.contoFinanziario.update({ where: { id }, data: dati });
    await registra("Conto", id, "Modificato", `${nome}: saldo iniziale ${eur(prima?.saldoIniziale ?? 0)} → ${eur(dati.saldoIniziale)} al ${giorno(dataSaldo)}`, u.nome);
  } else {
    const c = await prisma.contoFinanziario.create({ data: dati });
    await registra("Conto", c.id, "Creato", `${nome} — saldo iniziale ${eur(dati.saldoIniziale)} al ${giorno(dataSaldo)}`, u.nome);
  }
  aggiorna();
}

// ======================= IMPORTAZIONE ESTRATTO =======================

export type AnteprimaImport = {
  ok: boolean;
  errore?: string;
  colonne?: { data: string; valuta?: string; importo?: string; entrate?: string; uscite?: string; descrizione: string[] };
  totaleRighe: number;
  nuove: number;
  doppioni: number;
  inMesiChiusi: number;
  scartate: { riga: number; motivo: string; testo: string }[];
  esempio: { data: string; importo: number; descrizione: string; doppione: boolean }[];
  periodo?: { da: string; a: string };
  totEntrate: number;
  totUscite: number;
  saldoAttuale: number;
  saldoDopo: number;
};

async function analizza(contoId: string, testo: string) {
  const lettura = leggiEstratto(testo);
  const impronte = improntePer(contoId, lettura.righe);
  const gia = new Set(
    (await prisma.movimentoFinanziario.findMany({ where: { impronta: { in: impronte } }, select: { impronta: true } })).map((m) => m.impronta),
  );
  const chiusi = await mesiChiusi();
  const conto = await prisma.contoFinanziario.findUnique({ where: { id: contoId } });
  const righe = lettura.righe.map((r, i) => {
    const { anno, mese } = meseDi(r.data);
    return { ...r, impronta: impronte[i], doppione: gia.has(impronte[i]), meseChiuso: chiusi.has(`${anno}-${mese}`), primaDelSaldo: !!conto && r.data <= conto.dataSaldoIniziale };
  });
  return { lettura, righe, conto };
}

export async function anteprimaImport(contoId: string, testo: string): Promise<AnteprimaImport> {
  const vuota = { totaleRighe: 0, nuove: 0, doppioni: 0, inMesiChiusi: 0, scartate: [], esempio: [], totEntrate: 0, totUscite: 0, saldoAttuale: 0, saldoDopo: 0 };
  const u = await utenteAmministrazione();
  if (!u) return { ok: false, errore: "Non autorizzato.", ...vuota };
  if (testo.length > 3_000_000) return { ok: false, errore: "File troppo grande (max 3 MB). Esporta un periodo più breve.", ...vuota };
  const { lettura, righe, conto } = await analizza(contoId, testo);
  if (!conto) return { ok: false, errore: "Conto non trovato.", ...vuota };
  if (!lettura.ok) return { ok: false, errore: lettura.errore, ...vuota, scartate: lettura.scartate.slice(0, 20) };
  const nuove = righe.filter((r) => !r.doppione && !r.meseChiuso && !r.primaDelSaldo);
  const date = righe.map((r) => r.data.getTime());
  const saldoAttuale = await saldoConto(contoId);
  const prima = righe.filter((r) => !r.doppione && r.primaDelSaldo).length;
  return {
    ok: true,
    errore: prima ? `${prima} movimenti hanno data uguale o precedente al saldo iniziale del conto (${giorno(conto.dataSaldoIniziale)}): sono già compresi in quel saldo e non verranno importati.` : undefined,
    colonne: lettura.colonne,
    totaleRighe: righe.length,
    nuove: nuove.length,
    doppioni: righe.filter((r) => r.doppione).length,
    inMesiChiusi: righe.filter((r) => !r.doppione && r.meseChiuso).length,
    scartate: lettura.scartate.slice(0, 20),
    esempio: righe.slice(0, 12).map((r) => ({ data: giorno(r.data), importo: r.importo, descrizione: r.descrizione, doppione: r.doppione })),
    periodo: { da: new Date(Math.min(...date)).toISOString().slice(0, 10), a: new Date(Math.max(...date)).toISOString().slice(0, 10) },
    totEntrate: cent(nuove.filter((r) => r.importo > 0).reduce((t, r) => t + r.importo, 0)),
    totUscite: cent(nuove.filter((r) => r.importo < 0).reduce((t, r) => t + r.importo, 0)),
    saldoAttuale,
    saldoDopo: cent(saldoAttuale + nuove.reduce((t, r) => t + r.importo, 0)),
  };
}

export type EsitoImport = { ok: boolean; messaggio: string; quadratura?: "OK" | "DIFFERENZA" | "NON_VERIFICATA"; differenza?: number; abbinatiAuto?: number };

export async function confermaImport(contoId: string, testo: string, nomeFile: string, saldoFinaleBanca: number | null): Promise<EsitoImport> {
  const u = await utenteAmministrazione();
  if (!u) return { ok: false, messaggio: "Non autorizzato." };
  const { lettura, righe, conto } = await analizza(contoId, testo);
  if (!conto) return { ok: false, messaggio: "Conto non trovato." };
  if (!lettura.ok) return { ok: false, messaggio: lettura.errore ?? "File non leggibile." };
  const daInserire = righe.filter((r) => !r.doppione && !r.meseChiuso && !r.primaDelSaldo);
  const imp = await prisma.importazioneEstratto.create({
    data: {
      contoId, nomeFile: nomeFile.slice(0, 200), righeTotali: righe.length, righeNuove: 0,
      doppioni: righe.filter((r) => r.doppione).length, scartate: lettura.scartate.length,
      dataDa: righe.length ? new Date(Math.min(...righe.map((r) => r.data.getTime()))) : null,
      dataA: righe.length ? new Date(Math.max(...righe.map((r) => r.data.getTime()))) : null,
      utenteNome: u.nome,
    },
  });
  // skipDuplicates: anche con due importazioni contemporanee lo stesso movimento entra una volta sola
  const res = await prisma.movimentoFinanziario.createMany({
    data: daInserire.map((r) => ({
      contoId, data: r.data, dataValuta: r.dataValuta, importo: r.importo, descrizione: r.descrizione.slice(0, 500),
      origine: "IMPORT", impronta: r.impronta, importazioneId: imp.id, creatoDaNome: u.nome,
    })),
    skipDuplicates: true,
  });
  // Quadratura: saldo del CRM alla data dell'ultimo movimento del file contro il saldo della banca
  let quadratura: EsitoImport["quadratura"] = "NON_VERIFICATA";
  let differenza: number | undefined;
  const dataA = imp.dataA ?? undefined;
  const saldoCalcolato = dataA ? await saldoConto(contoId, new Date(dataA.getTime() + 12 * 3600000)) : await saldoConto(contoId);
  if (saldoFinaleBanca !== null) {
    differenza = cent(saldoFinaleBanca - saldoCalcolato);
    quadratura = Math.abs(differenza) < 0.005 ? "OK" : "DIFFERENZA";
  }
  await prisma.importazioneEstratto.update({
    where: { id: imp.id },
    data: { righeNuove: res.count, saldoFinaleBanca, saldoCalcolato },
  });
  await registra("Importazione", imp.id, "Estratto importato", `${conto.nome} · ${nomeFile} · ${res.count} nuovi, ${imp.doppioni} doppioni scartati${quadratura === "DIFFERENZA" ? ` · DIFFERENZA DI QUADRATURA ${eur(differenza!)}` : quadratura === "OK" ? " · quadratura OK" : ""}`, u.nome);
  const abbinatiAuto = await abbinaSicuriInterno(u.nome, imp.id);
  aggiorna();
  return {
    ok: true,
    messaggio: `Importati ${res.count} movimenti nuovi su ${righe.length}. ${imp.doppioni} doppioni ignorati.${abbinatiAuto ? ` ${abbinatiAuto} abbinati in automatico (importo e nome coincidono).` : ""}`,
    quadratura, differenza, abbinatiAuto,
  };
}

/** Annulla un'importazione sbagliata (es. file caricato sul conto sbagliato). Solo se nessun movimento è stato ancora lavorato. */
export async function annullaImportazione(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u || u.ruolo !== "AMMINISTRATORE") return;
  const id = str(fd, "id");
  if (!id || fd.get("conferma") !== "si") return;
  const movimenti = await prisma.movimentoFinanziario.findMany({ where: { importazioneId: id }, include: { abbinamenti: true } });
  if (movimenti.some((m) => m.abbinamenti.length || m.stato !== "DA_ABBINARE" || m.stornatoDaId)) return;
  for (const m of movimenti) if (await eMeseChiuso(m.data)) return;
  const imp = await prisma.importazioneEstratto.findUnique({ where: { id }, include: { conto: true } });
  await prisma.movimentoFinanziario.deleteMany({ where: { importazioneId: id } });
  await prisma.importazioneEstratto.update({ where: { id }, data: { righeNuove: 0, nomeFile: `[ANNULLATA] ${imp?.nomeFile ?? ""}`.slice(0, 200) } });
  await registra("Importazione", id, "Importazione annullata", `${imp?.conto.nome} · ${imp?.nomeFile} · ${movimenti.length} movimenti rimossi`, u.nome);
  aggiorna();
}

// ======================= ABBINAMENTI =======================

async function abbina(movimentoId: string, scadenzaId: string, importoRichiesto: number | null, utenteNome: string): Promise<string | null> {
  const [m, s] = await Promise.all([
    prisma.movimentoFinanziario.findUnique({ where: { id: movimentoId }, include: { abbinamenti: true } }),
    prisma.scadenza.findUnique({ where: { id: scadenzaId }, include: { abbinamenti: true } }),
  ]);
  if (!m || !s) return "Movimento o scadenza non trovati.";
  if (m.stato === "REGISTRATO") return "Il movimento è già registrato senza scadenza.";
  if (s.stato === "ANNULLATA") return "La scadenza è annullata.";
  if ((m.importo > 0 ? "INCASSO" : "PAGAMENTO") !== s.tipo) return "Un'entrata si abbina solo a un incasso, un'uscita solo a un pagamento.";
  if (await eMeseChiuso(m.data)) return "Il mese del movimento è chiuso.";
  if (m.abbinamenti.some((a) => a.scadenzaId === s.id)) return "Già abbinati.";
  const massimo = Math.min(residuoMovimento(m), residuoScadenza(s));
  if (massimo <= 0.004) return "Niente da abbinare: movimento o scadenza già coperti.";
  const importo = cent(importoRichiesto && importoRichiesto > 0 ? Math.min(importoRichiesto, massimo) : massimo);
  await prisma.abbinamentoScadenza.create({ data: { movimentoId: m.id, scadenzaId: s.id, importo, creatoDaNome: utenteNome } });
  await ricalcolaMovimento(m.id);
  await ricalcolaScadenza(s.id);
  await registra("Abbinamento", m.id, "Abbinato", `${giorno(m.data)} ${eur(m.importo)} «${m.descrizione.slice(0, 60)}» → ${s.controparte} · ${s.descrizione} (${eur(importo)})`, utenteNome);
  return null;
}

export async function abbinaMovimento(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const m = str(fd, "movimentoId"), s = str(fd, "scadenzaId");
  if (!m || !s) return;
  await abbina(m, s, num(fd, "importo"), u.nome);
  aggiorna();
}

async function abbinaSicuriInterno(utenteNome: string, importazioneId?: string): Promise<number> {
  const [movimenti, scadenze] = await Promise.all([
    prisma.movimentoFinanziario.findMany({ where: { stato: "DA_ABBINARE", abbinamenti: { none: {} }, ...(importazioneId ? { importazioneId } : {}) }, take: 2000 }),
    prisma.scadenza.findMany({ where: { stato: { in: ["APERTA", "PARZIALE"] } }, include: { abbinamenti: true } }),
  ]);
  const candidati = scadenze.map((s) => ({ ...s, residuo: residuoScadenza(s) }));
  const usate = new Set<string>();
  let n = 0;
  for (const m of movimenti) {
    const sugg = suggerisci(m, candidati.filter((c) => !usate.has(c.id)), 2);
    if (sugg[0]?.sicuro) {
      const err = await abbina(m.id, sugg[0].scadenzaId, null, `${utenteNome} (automatico)`);
      if (!err) { usate.add(sugg[0].scadenzaId); n++; }
    }
  }
  return n;
}

export async function abbinaSicuri() {
  const u = await utenteAmministrazione();
  if (!u) return;
  await abbinaSicuriInterno(u.nome);
  aggiorna();
}

export async function scollegaAbbinamento(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  const a = await prisma.abbinamentoScadenza.findUnique({ where: { id }, include: { movimento: true, scadenza: true } });
  if (!a || (await eMeseChiuso(a.movimento.data))) return;
  await prisma.abbinamentoScadenza.delete({ where: { id } });
  await ricalcolaMovimento(a.movimentoId);
  await ricalcolaScadenza(a.scadenzaId);
  await registra("Abbinamento", a.movimentoId, "Abbinamento rimosso", `${giorno(a.movimento.data)} ${eur(a.movimento.importo)} ✕ ${a.scadenza.controparte} · ${a.scadenza.descrizione} (${eur(a.importo)})`, u.nome);
  aggiorna();
}

/** Classifica un movimento senza scadenza (commissioni, stipendi, F24, giroconti…). */
export async function registraMovimento(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id"), categoria = str(fd, "categoria");
  if (!id || !categoria) return;
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id }, include: { abbinamenti: true } });
  if (!m || m.abbinamenti.length || (await eMeseChiuso(m.data))) return;
  const divisione = str(fd, "divisione");
  await prisma.movimentoFinanziario.update({ where: { id }, data: { stato: "REGISTRATO", categoria, divisione: divisione ?? m.divisione, note: str(fd, "note") ?? m.note } });
  await registra("Movimento", id, "Registrato", `${giorno(m.data)} ${eur(m.importo)} «${m.descrizione.slice(0, 60)}» → ${categoria}${divisione ? " · " + divisione : ""}`, u.nome);
  aggiorna();
}

export async function annullaRegistrazione(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id } });
  if (!m || m.stato !== "REGISTRATO" || (await eMeseChiuso(m.data))) return;
  await prisma.movimentoFinanziario.update({ where: { id }, data: { stato: "DA_ABBINARE", categoria: null } });
  await registra("Movimento", id, "Registrazione annullata", `${giorno(m.data)} ${eur(m.importo)} (era: ${m.categoria})`, u.nome);
  aggiorna();
}

/** Movimento manuale (cassa contanti, rettifiche). */
export async function nuovoMovimento(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const contoId = str(fd, "contoId"), descrizione = str(fd, "descrizione");
  const data = dataDa(fd, "data");
  const valore = num(fd, "importo");
  if (!contoId || !descrizione || !data || !valore) return;
  if (await eMeseChiuso(data)) return;
  const importo = cent(Math.abs(valore) * (str(fd, "verso") === "uscita" ? -1 : 1));
  const categoria = str(fd, "categoria");
  const m = await prisma.movimentoFinanziario.create({
    data: {
      contoId, data, importo, descrizione, origine: "MANUALE", impronta: `MAN-${randomUUID()}`,
      stato: categoria ? "REGISTRATO" : "DA_ABBINARE", categoria, divisione: str(fd, "divisione"), creatoDaNome: u.nome,
    },
  });
  await registra("Movimento", m.id, "Inserito a mano", `${giorno(data)} ${eur(importo)} «${descrizione}»${categoria ? " → " + categoria : ""}`, u.nome);
  aggiorna();
}

/** Storno di un movimento inserito a mano: crea il movimento opposto, l'originale resta visibile. */
export async function stornaMovimento(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id }, include: { abbinamenti: true } });
  if (!m || m.origine !== "MANUALE" || m.stornatoDaId || m.abbinamenti.length) return;
  const oggi = new Date();
  if (await eMeseChiuso(oggi)) return;
  const st = await prisma.movimentoFinanziario.create({
    data: {
      contoId: m.contoId, data: (await eMeseChiuso(m.data)) ? oggi : m.data, importo: -m.importo,
      descrizione: `STORNO di: ${m.descrizione}`, origine: "STORNO", impronta: `STO-${randomUUID()}`,
      stato: "REGISTRATO", categoria: "Storno", stornoDiId: m.id, creatoDaNome: u.nome, note: str(fd, "motivo"),
    },
  });
  await prisma.movimentoFinanziario.update({ where: { id: m.id }, data: { stornatoDaId: st.id, stato: "REGISTRATO", categoria: m.categoria ?? "Stornato" } });
  await registra("Movimento", m.id, "Stornato", `${giorno(m.data)} ${eur(m.importo)} «${m.descrizione.slice(0, 60)}»${str(fd, "motivo") ? " — motivo: " + str(fd, "motivo") : ""}`, u.nome);
  aggiorna();
}

// ======================= SCADENZE =======================

export async function nuovaScadenza(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const tipo = str(fd, "tipo") === "PAGAMENTO" ? "PAGAMENTO" : "INCASSO";
  const controparte = str(fd, "controparte"), descrizione = str(fd, "descrizione");
  const importo = num(fd, "importo");
  if (!controparte || !descrizione || !importo || importo <= 0) return;
  const rate = Math.min(24, Math.max(1, Math.round(num(fd, "rate") ?? 1)));
  const prima = dataDa(fd, "dataScadenza");
  const quota = cent(importo / rate);
  for (let i = 0; i < rate; i++) {
    const data = prima ? new Date(Date.UTC(prima.getUTCFullYear(), prima.getUTCMonth() + i, prima.getUTCDate(), 12)) : null;
    const imp = i === rate - 1 ? cent(importo - quota * (rate - 1)) : quota;
    const s = await prisma.scadenza.create({
      data: {
        tipo, controparte, descrizione: rate > 1 ? `${descrizione} (rata ${i + 1}/${rate})` : descrizione,
        importo: imp, dataScadenza: data, dataModificata: true, numeroDocumento: str(fd, "numeroDocumento"),
        categoria: str(fd, "categoria"), brand: str(fd, "brand"), soggettoId: str(fd, "soggettoId"), clienteId: str(fd, "clienteId"), note: str(fd, "note"),
      },
    });
    await registra("Scadenza", s.id, "Creata", `${tipo === "INCASSO" ? "Incasso" : "Pagamento"} ${controparte} · ${s.descrizione} · ${eur(imp)}${data ? " al " + giorno(data) : ""}`, u.nome);
  }
  aggiorna();
}

export async function modificaScadenza(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  const s = await prisma.scadenza.findUnique({ where: { id }, include: { abbinamenti: true } });
  if (!s) return;
  const data = dataDa(fd, "dataScadenza");
  const nuovoImporto = num(fd, "importo");
  const cambi: string[] = [];
  const dati: Record<string, unknown> = {};
  if ((data?.getTime() ?? null) !== (s.dataScadenza?.getTime() ?? null)) {
    dati.dataScadenza = data; dati.dataModificata = true;
    cambi.push(`data ${s.dataScadenza ? giorno(s.dataScadenza) : "—"} → ${data ? giorno(data) : "—"}`);
  }
  // l'importo di una scadenza generata dalla commessa si cambia nella commessa
  if (nuovoImporto && s.origine === "MANUALE" && Math.abs(nuovoImporto - s.importo) > 0.004) {
    const pagato = s.importo - residuoScadenza(s);
    if (nuovoImporto >= pagato - 0.004) { dati.importo = cent(nuovoImporto); cambi.push(`importo ${eur(s.importo)} → ${eur(nuovoImporto)}`); }
  }
  for (const k of ["numeroDocumento", "note", "categoria"] as const) {
    const v = str(fd, k);
    if (fd.has(k) && v !== s[k]) { dati[k] = v; cambi.push(`${k}: ${v ?? "—"}`); }
  }
  if (!cambi.length) return;
  await prisma.scadenza.update({ where: { id }, data: dati });
  await ricalcolaScadenza(id);
  await registra("Scadenza", id, "Modificata", `${s.controparte} · ${s.descrizione}: ${cambi.join("; ")}`, u.nome);
  aggiorna();
}

/** Segna come saldata una scadenza pagata fuori dalle banche importate (contanti, assegno, compensazione). */
export async function saldaManualmente(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id"), motivo = str(fd, "motivo");
  if (!id || !motivo) return;
  const s = await prisma.scadenza.findUnique({ where: { id }, include: { abbinamenti: true } });
  if (!s || s.stato === "ANNULLATA") return;
  const residuo = residuoScadenza(s);
  const importo = cent(Math.min(num(fd, "importo") ?? residuo, residuo));
  if (importo <= 0) return;
  await prisma.scadenza.update({ where: { id }, data: { pagatoManuale: cent(s.pagatoManuale + importo), note: [s.note, `Saldata a mano ${eur(importo)}: ${motivo}`].filter(Boolean).join("\n") } });
  await ricalcolaScadenza(id);
  await registra("Scadenza", id, "Saldata a mano", `${s.controparte} · ${s.descrizione} · ${eur(importo)} — ${motivo}`, u.nome);
  aggiorna();
}

export async function annullaScadenza(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id"), motivo = str(fd, "motivo");
  if (!id || !motivo) return;
  const s = await prisma.scadenza.findUnique({ where: { id }, include: { abbinamenti: true } });
  if (!s || s.abbinamenti.length || s.pagatoManuale > 0 || s.origine !== "MANUALE") return;
  await prisma.scadenza.update({ where: { id }, data: { stato: "ANNULLATA", note: [s.note, `Annullata: ${motivo}`].filter(Boolean).join("\n") } });
  await registra("Scadenza", id, "Annullata", `${s.controparte} · ${s.descrizione} · ${eur(s.importo)} — ${motivo}`, u.nome);
  aggiorna();
}

// ======================= CHIUSURA MESE =======================

export async function chiudiMese(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const anno = Math.round(num(fd, "anno") ?? 0), mese = Math.round(num(fd, "mese") ?? 0);
  if (anno < 2000 || mese < 1 || mese > 12) return;
  const fine = new Date(Date.UTC(mese === 12 ? anno + 1 : anno, mese === 12 ? 0 : mese, 1));
  const inizio = new Date(Date.UTC(anno, mese - 1, 1));
  const aperti = await prisma.movimentoFinanziario.count({ where: { stato: "DA_ABBINARE", data: { gte: inizio, lt: fine } } });
  if (aperti > 0 && fd.get("forza") !== "si") return;
  await prisma.chiusuraMese.upsert({ where: { anno_mese: { anno, mese } }, create: { anno, mese, chiusoDaNome: u.nome }, update: {} });
  await registra("Chiusura", `${anno}-${mese}`, "Mese chiuso", `${String(mese).padStart(2, "0")}/${anno}${aperti ? ` con ${aperti} movimenti ancora da abbinare` : ""}`, u.nome);
  aggiorna();
}

export async function riapriMese(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u || u.ruolo !== "AMMINISTRATORE") return;
  const anno = Math.round(num(fd, "anno") ?? 0), mese = Math.round(num(fd, "mese") ?? 0);
  const motivo = str(fd, "motivo");
  if (!motivo) return;
  await prisma.chiusuraMese.deleteMany({ where: { anno, mese } });
  await registra("Chiusura", `${anno}-${mese}`, "Mese riaperto", `${String(mese).padStart(2, "0")}/${anno} — motivo: ${motivo}`, u.nome);
  aggiorna();
}

/** Imposta la divisione (centro) di un movimento. */
export async function impostaDivisione(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  const m = await prisma.movimentoFinanziario.findUnique({ where: { id } });
  if (!m || (await eMeseChiuso(m.data))) return;
  const divisione = str(fd, "divisione");
  if (divisione === m.divisione) return;
  await prisma.movimentoFinanziario.update({ where: { id }, data: { divisione } });
  await registra("Movimento", id, "Divisione", `${giorno(m.data)} ${eur(m.importo)} → ${divisione ?? "nessuna"}`, u.nome);
  aggiorna();
}

// ======================= VISTE SALVATE =======================

export async function salvaVista(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const pagina = str(fd, "pagina"), nome = str(fd, "nome");
  const query = (str(fd, "query") ?? "").replace(/^\?/, "").slice(0, 500);
  if (!pagina || !nome || !pagina.startsWith("/amministrazione")) return;
  await prisma.vistaSalvata.create({ data: { utenteId: u.id, pagina, nome: nome.slice(0, 60), query } });
  aggiorna();
}

export async function eliminaVista(fd: FormData) {
  const u = await utenteAmministrazione();
  if (!u) return;
  const id = str(fd, "id");
  if (!id) return;
  await prisma.vistaSalvata.deleteMany({ where: { id, utenteId: u.id } });
  aggiorna();
}

// ======================= IMPORTAZIONE PRIMA NOTA DA FOGLIO =======================

export type AnteprimaFoglio = {
  ok: boolean;
  errore?: string;
  aperturaFoglio?: { importo: number; etichetta: string; data: string | null };
  contoSenzaMovimenti: boolean;
  saldoInizialeConto: number;
  dataSaldoInizialeConto: string;
  movimenti: number;
  nuovi: number;
  doppioni: number;
  inMesiChiusi: number;
  primaDelSaldo: number;
  periodo?: { da: string; a: string };
  entrate: number;
  uscite: number;
  categorie: { categoria: string; n: number; totale: number }[];
  daAbbinare: number;
  salti: { riga: number; atteso: number; foglio: number; differenza: number }[];
  saldoFinaleFoglio: number | null;
  saldoCalcolatoFoglio: number | null;
  programmate: { data: string; importo: number; descrizione: string; passata: boolean; giaPresente: boolean }[];
  righeVuote: number;
};

/** Inizio di oggi (ora italiana ≈ UTC del giorno): righe senza totale prima di oggi sono da verificare. */
const oggiInizio = () => new Date(`${giorno(new Date())}T00:00:00Z`);

const chiaveScadenzaFoglio = (contoId: string, r: { data: Date; importo: number; tipo: string; rif: string; controparte: string }, n: number) =>
  createHash("sha256").update([contoId, giorno(r.data), Math.round(r.importo * 100), descrizioneRiga(r).toUpperCase().replace(/\s+/g, ""), n].join("|")).digest("hex");

async function analizzaFoglio(contoId: string, testo: string) {
  const f = leggiPrimaNotaFoglio(testo);
  const conto = await prisma.contoFinanziario.findUnique({ where: { id: contoId } });
  const descr = f.movimenti.map((r) => ({ data: r.data, importo: r.importo, descrizione: descrizioneRiga(r) }));
  const impronte = improntePer(contoId, descr);
  const gia = new Set((await prisma.movimentoFinanziario.findMany({ where: { impronta: { in: impronte } }, select: { impronta: true } })).map((m) => m.impronta));
  const chiusi = await mesiChiusi();
  const righe = f.movimenti.map((r, i) => {
    const { anno, mese } = meseDi(r.data);
    return { ...r, descrizione: descr[i].descrizione, impronta: impronte[i], doppione: gia.has(impronte[i]), meseChiuso: chiusi.has(`${anno}-${mese}`), categoria: categoriaDaFoglio(r) };
  });
  const visti = new Map<string, number>();
  const programmate = f.senzaTotale.map((r) => {
    const base = descrizioneRiga(r) + giorno(r.data) + r.importo;
    const n = (visti.get(base) ?? 0) + 1; visti.set(base, n);
    return { ...r, chiave: chiaveScadenzaFoglio(contoId, r, n) };
  });
  const giaScad = new Set((await prisma.scadenza.findMany({ where: { chiaveImport: { in: programmate.map((p) => p.chiave) } }, select: { chiaveImport: true } })).map((s) => s.chiaveImport));
  const nMov = conto ? await prisma.movimentoFinanziario.count({ where: { contoId } }) : 0;
  return { f, conto, righe, programmate, giaScad, contoSenzaMovimenti: nMov === 0 };
}

export async function anteprimaFoglio(contoId: string, testo: string, dataApertura: string | null): Promise<AnteprimaFoglio> {
  const base = { contoSenzaMovimenti: false, saldoInizialeConto: 0, dataSaldoInizialeConto: "", movimenti: 0, nuovi: 0, doppioni: 0, inMesiChiusi: 0, primaDelSaldo: 0, entrate: 0, uscite: 0, categorie: [], daAbbinare: 0, salti: [], saldoFinaleFoglio: null, saldoCalcolatoFoglio: null, programmate: [], righeVuote: 0 };
  const u = await utenteAmministrazione();
  if (!u) return { ok: false, errore: "Non autorizzato.", ...base };
  if (testo.length > 5_000_000) return { ok: false, errore: "File troppo grande.", ...base };
  const { f, conto, righe, programmate, giaScad, contoSenzaMovimenti } = await analizzaFoglio(contoId, testo);
  if (!conto) return { ok: false, errore: "Conto non trovato.", ...base };
  if (!f.ok) return { ok: false, errore: f.errore, ...base };
  // con il saldo iniziale che verrà impostato (conto vuoto) la data di riferimento è quella di apertura
  const dataRif = contoSenzaMovimenti && dataApertura ? new Date(`${dataApertura}T12:00:00Z`) : conto.dataSaldoIniziale;
  const valide = righe.filter((r) => !r.doppione && !r.meseChiuso && r.data > dataRif);
  const cat = new Map<string, { n: number; totale: number }>();
  for (const r of valide) {
    const k = r.categoria ?? "Da abbinare (incassi clienti, fornitori…)";
    const x = cat.get(k) ?? { n: 0, totale: 0 };
    x.n++; x.totale = cent(x.totale + r.importo); cat.set(k, x);
  }
  return {
    ok: true,
    aperturaFoglio: f.saldoIniziale ? { importo: f.saldoIniziale.importo, etichetta: f.saldoIniziale.etichetta, data: f.saldoIniziale.data ? giorno(f.saldoIniziale.data) : null } : undefined,
    contoSenzaMovimenti,
    saldoInizialeConto: conto.saldoIniziale,
    dataSaldoInizialeConto: giorno(conto.dataSaldoIniziale),
    movimenti: righe.length,
    nuovi: valide.length,
    doppioni: righe.filter((r) => r.doppione).length,
    inMesiChiusi: righe.filter((r) => !r.doppione && r.meseChiuso).length,
    primaDelSaldo: righe.filter((r) => !r.doppione && r.data <= dataRif).length,
    periodo: righe.length ? { da: giorno(new Date(Math.min(...righe.map((r) => r.data.getTime())))), a: giorno(new Date(Math.max(...righe.map((r) => r.data.getTime())))) } : undefined,
    entrate: cent(valide.filter((r) => r.importo > 0).reduce((t, r) => t + r.importo, 0)),
    uscite: cent(valide.filter((r) => r.importo < 0).reduce((t, r) => t + r.importo, 0)),
    categorie: [...cat.entries()].map(([categoria, v]) => ({ categoria, ...v })).sort((a, b) => b.n - a.n),
    daAbbinare: valide.filter((r) => !r.categoria).length,
    salti: f.salti.slice(0, 20),
    saldoFinaleFoglio: f.saldoFinaleFoglio,
    saldoCalcolatoFoglio: f.saldoCalcolato,
    programmate: programmate.map((p) => ({ data: giorno(p.data), importo: p.importo, descrizione: descrizioneRiga(p), passata: p.data < oggiInizio(), giaPresente: giaScad.has(p.chiave) })),
    righeVuote: f.righeVuote,
  };
}

export async function confermaFoglio(contoId: string, testo: string, nomeFile: string, impostaApertura: boolean, dataApertura: string | null): Promise<EsitoImport> {
  const u = await utenteAmministrazione();
  if (!u) return { ok: false, messaggio: "Non autorizzato." };
  const analisi = await analizzaFoglio(contoId, testo);
  const { f, righe, programmate, contoSenzaMovimenti } = analisi;
  let conto = analisi.conto;
  if (!conto) return { ok: false, messaggio: "Conto non trovato." };
  if (!f.ok || !f.saldoIniziale) return { ok: false, messaggio: f.errore ?? "Foglio non leggibile." };
  if (f.salti.length) return { ok: false, messaggio: `Il totale progressivo del foglio ha ${f.salti.length} salti (prima alla riga ${f.salti[0].riga}): correggi il foglio prima di importare.` };
  // saldo di apertura del foglio come saldo iniziale del conto (solo su un conto ancora vuoto)
  if (impostaApertura) {
    if (!contoSenzaMovimenti) return { ok: false, messaggio: "Il saldo iniziale si può impostare dal foglio solo su un conto senza movimenti." };
    if (!dataApertura || !/^\d{4}-\d{2}-\d{2}$/.test(dataApertura)) return { ok: false, messaggio: "Indica la data del saldo di apertura." };
    const prima = conto.saldoIniziale;
    conto = await prisma.contoFinanziario.update({ where: { id: contoId }, data: { saldoIniziale: f.saldoIniziale.importo, dataSaldoIniziale: new Date(`${dataApertura}T12:00:00Z`) } });
    await registra("Conto", contoId, "Saldo iniziale dal foglio", `${conto.nome}: ${eur(prima)} → ${eur(f.saldoIniziale.importo)} al ${dataApertura} («${f.saldoIniziale.etichetta}» in ${nomeFile})`, u.nome);
  }
  const dataRif = conto.dataSaldoIniziale;
  const daInserire = righe.filter((r) => !r.doppione && !r.meseChiuso && r.data > dataRif);
  const imp = await prisma.importazioneEstratto.create({
    data: {
      contoId, nomeFile: `[Foglio] ${nomeFile}`.slice(0, 200), righeTotali: righe.length, righeNuove: 0,
      doppioni: righe.filter((r) => r.doppione).length, scartate: f.righeVuote,
      dataDa: righe.length ? new Date(Math.min(...righe.map((r) => r.data.getTime()))) : null,
      dataA: righe.length ? new Date(Math.max(...righe.map((r) => r.data.getTime()))) : null,
      utenteNome: u.nome,
    },
  });
  const res = await prisma.movimentoFinanziario.createMany({
    data: daInserire.map((r) => ({
      contoId, data: r.data, importo: r.importo, descrizione: r.descrizione.slice(0, 500), origine: "FOGLIO", impronta: r.impronta,
      importazioneId: imp.id, creatoDaNome: u.nome, stato: r.categoria ? "REGISTRATO" : "DA_ABBINARE", categoria: r.categoria,
      divisione: conto!.divisione, note: r.appunti ? r.appunti.slice(0, 500) : null,
    })),
    skipDuplicates: true,
  });
  // righe senza totale → scadenze (programmate o da verificare)
  const ultima = f.movimenti.reduce((a, r) => (r.data > a ? r.data : a), f.movimenti[0].data);
  // nessun doppione anche con due importazioni contemporanee: blocco per conto e nuovo controllo dentro la transazione
  const sc = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"foglio:" + contoId}))`;
    const esistenti = new Set((await tx.scadenza.findMany({ where: { chiaveImport: { in: programmate.map((p) => p.chiave) } }, select: { chiaveImport: true } })).map((s) => s.chiaveImport));
    const nuoveScad = programmate.filter((p) => !esistenti.has(p.chiave));
    return tx.scadenza.createMany({
    data: nuoveScad.map((p) => ({
      tipo: p.importo < 0 ? "PAGAMENTO" : "INCASSO", origine: "FOGLIO", chiaveImport: p.chiave,
      controparte: p.controparte || p.tipo || "—", descrizione: [p.tipo, p.rif].filter(Boolean).join(" · ").slice(0, 300) || "Movimento programmato",
      importo: cent(Math.abs(p.importo)), dataScadenza: p.data, dataModificata: true, brand: conto!.divisione, categoria: "Da prima nota foglio",
      note: p.data < oggiInizio() ? `Riga del foglio ${nomeFile} senza totale (non conteggiata nel saldo): verificare se pagata, insoluta o da correggere.` : `Programmato nel foglio ${nomeFile} (${conto!.nome}).`,
    })),
    });
  });
  // quadratura: saldo CRM alla data dell'ultima riga del foglio contro il totale finale del foglio
  const saldoCalcolato = await saldoConto(contoId, new Date(ultima.getTime() + 12 * 3600000));
  const differenza = f.saldoFinaleFoglio === null ? undefined : cent(f.saldoFinaleFoglio - saldoCalcolato);
  await prisma.importazioneEstratto.update({ where: { id: imp.id }, data: { righeNuove: res.count, saldoFinaleBanca: f.saldoFinaleFoglio, saldoCalcolato } });
  await registra("Importazione", imp.id, "Prima nota da foglio", `${conto.nome} · ${nomeFile} · ${res.count} movimenti, ${sc.count} scadenze${differenza === undefined ? "" : Math.abs(differenza) < 0.005 ? " · quadratura OK" : ` · DIFFERENZA ${eur(differenza)}`}`, u.nome);
  const abbinatiAuto = await abbinaSicuriInterno(u.nome, imp.id);
  aggiorna();
  return {
    ok: true,
    messaggio: `Importati ${res.count} movimenti (${righe.filter((r) => r.doppione).length} già presenti) e ${sc.count} scadenze dalle righe senza totale.${abbinatiAuto ? ` ${abbinatiAuto} abbinati in automatico.` : ""}`,
    quadratura: differenza === undefined ? "NON_VERIFICATA" : Math.abs(differenza) < 0.005 ? "OK" : "DIFFERENZA",
    differenza, abbinatiAuto,
  };
}
