// Contabilità da BConsole: fatture di vendita, fatture d'acquisto e stato delle rate (saldate, aperte, ritenute).
// Si può rilanciare quante volte si vuole: non crea doppioni e aggiorna gli stati delle rate (es. controllo di fine anno).
// I pagamenti registrati nel CRM non vengono mai toccati.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chiaveFattura } from "@/lib/fatture/fatturapa";
import { nomeNorm, sezionaleDaNumero } from "@/lib/fatture/vendite";
import { categoriaFattura, descrizioneBreve } from "@/lib/report/categorie";

const cent = (n: number) => Math.round(n * 100) / 100;
const pivaNorm = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const data12 = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const dataIt = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export type RataBC = { bcId: string; descrizione: string; scadenza: string | null; importo: number; stato: string; pagataIl?: string | null; metodo?: string | null; banca?: string | null };
export type DocumentoBC = {
  tipo: "VENDITA" | "ACQUISTO";
  bcId: string;
  sigla: string; // FT, FAC, FSA, NC… / FS, FP, NAC, PA
  numero: string; // numero della fattura (per gli acquisti: quello del fornitore)
  protocollo?: string | null; // numero interno BConsole (acquisti)
  data: string; // AAAA-MM-GG
  controparte: string;
  bcAnagrafica?: string | null;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  imponibile: number;
  iva: number;
  totale: number;
  riferimento?: string | null;
  tipologia?: string | null; // P&C, Solaris, Pura Fonte, Plasma30
  progetti?: string[];
  rate: RataBC[];
  // per i report (vendite): sigla del venditore, righe della fattura e descrizione del progetto BConsole
  venditore?: string | null;
  righe?: string[];
  progettoDescrizione?: string | null;
};

/** Campi dei report di una fattura di vendita: venditore, progetto, linea di prodotto, descrizione delle righe. */
export function datiReportVendita(d: DocumentoBC) {
  return {
    venditore: d.venditore?.trim().toUpperCase() || null,
    progetto: d.progetti?.[0] ?? null,
    categoria: categoriaFattura({ progetto: d.progettoDescrizione, righe: d.righe, riferimento: d.riferimento, marchio: d.tipologia }),
    descrizione: descrizioneBreve(d.righe ?? []) ?? d.progettoDescrizione?.replace(/\s*Rif\.prev\..*$/i, "").trim() ?? null,
  };
}

/** Solo i campi ancora vuoti (non si sovrascrive ciò che è già stato scritto). */
export function soloVuoti<T extends Record<string, unknown>>(attuale: Record<string, unknown>, nuovi: T): Partial<T> {
  return Object.fromEntries(Object.entries(nuovi).filter(([k, v]) => v !== null && v !== undefined && v !== "" && (attuale[k] === null || attuale[k] === undefined || attuale[k] === ""))) as Partial<T>;
}

/** Stato della rata in BConsole → come la tratta il CRM. */
export function statoRata(dsc: string): "PAGATA" | "RITENUTA" | "STORNATA" | "PARZIALE" | "APERTA" {
  const s = dsc.toLowerCase().trim();
  if (s.startsWith("rit")) return "RITENUTA"; // "Rit. Fis Compensazione": la ritenuta trattenuta dalla banca
  if (s === "stornata") return "STORNATA";
  if (s === "saldata parzialmente") return "PARZIALE";
  if (/^(saldata|saldata con cc|chiusa|compensata|compensata con crediti|cassa iva estero|cassa q8|fatturata da ordine)$/.test(s)) return "PAGATA";
  return "APERTA"; // aperta, insoluta, anticipata, scaduta, in offerta, previsionale
}

/** Tipo documento del CRM dalla sigla BConsole. */
export function tipoDocumento(d: Pick<DocumentoBC, "tipo" | "sigla" | "totale">): string {
  const s = d.sigla.toUpperCase();
  if (d.tipo === "ACQUISTO" && s === "FP") return "PROFORMA";
  if (/^(NC|NAC|NCC)$/.test(s) || d.totale < 0) return "TD04";
  if (d.tipo === "ACQUISTO" && s === "PA") return "TD06";
  if (d.tipo === "VENDITA" && s === "FAC") return "TD02";
  return "TD01";
}

export const marchioDa = (t?: string | null) => (!t ? null : /pura/i.test(t) ? "Purafonte" : /solaris/i.test(t) ? "Solaris" : /plasma/i.test(t) ? "Plasma30" : /p&c|p & c/i.test(t) ? "P&C" : t);

/** Nota sulla scadenza che spiega cosa dice BConsole. */
export function notaRata(r: RataBC): string {
  const st = statoRata(r.stato);
  const come = [r.metodo, r.banca].filter(Boolean).join(" · ");
  if (st === "PAGATA") return `Saldata in BConsole${r.pagataIl ? ` il ${dataIt(r.pagataIl)}` : ""}${come ? ` (${come})` : ""} [${r.stato}]`;
  if (st === "RITENUTA") return `Ritenuta trattenuta dalla banca (BConsole: ${r.stato})`;
  if (st === "PARZIALE") return "In BConsole: saldata parzialmente — verificare quanto è stato incassato e registrarlo qui";
  return `In BConsole: ${r.stato}`;
}

export type Esito = { nuove: number; aggiornate: number; invariate: number; doppie: number; scartate: number; rateSaldate: number; rateAperte: number; fornitoriCreati: number; avvisi: string[] };
export const esitoVuoto = (): Esito => ({ nuove: 0, aggiornate: 0, invariate: 0, doppie: 0, scartate: 0, rateSaldate: 0, rateAperte: 0, fornitoriCreati: 0, avvisi: [] });

type Tx = Prisma.TransactionClient;

/** Applica lo stato BConsole a una scadenza: mai sopra ai pagamenti registrati nel CRM. Ritorna true se è cambiata. */
async function allineaScadenza(tx: Tx, id: string, r: RataBC): Promise<boolean> {
  const s = await tx.scadenza.findUniqueOrThrow({ where: { id }, include: { abbinamenti: { select: { importo: true } } } });
  const st = statoRata(r.stato);
  const nelCrm = cent(s.abbinamenti.reduce((t, a) => t + a.importo, 0)); // pagamenti registrati nel CRM: restano
  let pagatoManuale = 0, ritenuta = s.ritenuta;
  if (st === "PAGATA") pagatoManuale = Math.max(0, cent(s.importo - nelCrm - s.ritenuta));
  if (st === "RITENUTA") { ritenuta = Math.max(0, cent(s.importo - nelCrm)); pagatoManuale = 0; }
  const pagato = cent(nelCrm + pagatoManuale + ritenuta);
  const stato = st === "STORNATA" ? "ANNULLATA" : pagato <= 0.004 ? "APERTA" : pagato >= cent(s.importo) - 0.004 ? "PAGATA" : "PARZIALE";
  const nota = notaRata(r);
  const cambia = Math.abs(pagatoManuale - s.pagatoManuale) > 0.004 || Math.abs(ritenuta - s.ritenuta) > 0.004 || stato !== s.stato || !(s.note ?? "").includes(nota);
  if (cambia) {
    const altre = (s.note ?? "").split("\n").filter((x) => x && !/BConsole/.test(x));
    await tx.scadenza.update({ where: { id }, data: { pagatoManuale, ritenuta, stato, note: [...altre, nota].join("\n") } });
  }
  return cambia;
}

// ======================= VENDITE =======================

export async function importaVenditaBC(d: DocumentoBC, e: Esito, prova = false) {
  const chiave = `BCV|${d.bcId}`;
  const anno = d.data.slice(0, 4);
  const esiste = await prisma.fatturaVendita.findFirst({
    where: { OR: [{ chiave }, { numero: d.numero, data: { gte: new Date(`${anno}-01-01T00:00:00Z`), lt: new Date(`${Number(anno) + 1}-01-01T00:00:00Z`) } }] },
  });
  const rate = d.rate.filter((r) => r.importo !== 0);
  if (esiste) {
    if (prova) { e.invariate++; return; }
    // già nel CRM: si completano i campi dei report ancora vuoti e si allineano gli stati delle rate venute da BConsole
    // "Altro" si può migliorare a un rilancio con più informazioni (es. la descrizione del progetto)
    const nuovi = datiReportVendita(d);
    const completa = soloVuoti({ ...esiste, categoria: esiste.categoria === "Altro" && nuovi.categoria !== "Altro" ? null : esiste.categoria }, nuovi);
    let cambiate = 0;
    if (Object.keys(completa).length) { await prisma.fatturaVendita.update({ where: { id: esiste.id }, data: completa }); cambiate++; }
    for (const r of rate) {
      const s = await prisma.scadenza.findFirst({ where: { OR: [{ chiaveImport: `BCV:${r.bcId}` }, { fatturaVenditaId: esiste.id, note: { contains: `[rata BC ${r.bcId}]` } }] }, select: { id: true } });
      if (s && (await prisma.$transaction((tx) => allineaScadenza(tx, s.id, r)))) cambiate++;
    }
    if (esiste.chiave !== chiave && !esiste.chiave.startsWith("BCV|")) e.doppie++; else if (cambiate) e.aggiornate++; else e.invariate++;
    return;
  }
  if (prova) { e.nuove++; return; }
  const cliente = await trovaCliente(d);
  const brand = marchioDa(d.tipologia);
  const tipo = tipoDocumento(d);
  const segno = tipo === "TD04" ? -1 : 1;
  await prisma.$transaction(async (tx) => {
    const fv = await tx.fatturaVendita.create({
      data: {
        chiave, sezionale: sezionaleDaNumero(d.numero), tipoDocumento: tipo, numero: d.numero, data: data12(d.data),
        clienteId: cliente?.id ?? null, clienteNome: cliente?.nome ?? d.controparte, partitaIva: pivaNorm(d.partitaIva) || null, codiceFiscale: d.codiceFiscale || null,
        divisione: "P&C", brand: brand ?? cliente?.brand.nome ?? null,
        imponibile: cent(segno * Math.abs(d.imponibile)), iva: cent(segno * Math.abs(d.iva)), totale: cent(segno * Math.abs(d.totale)),
        detrazione: rate.some((r) => statoRata(r.stato) === "RITENUTA"), causale: d.riferimento || null, origine: "BCONSOLE",
        note: `Importata da BConsole${d.progetti?.length ? ` · progetto ${d.progetti.join(", ")}` : ""}`, creatoDaNome: "Import BConsole",
        ...datiReportVendita(d),
      },
    });
    if (tipo === "TD04") return; // nota di credito: nessun incasso
    for (const [i, r] of rate.entries()) {
      // la commessa del CRM ha già l'incasso con lo stesso importo (acconto/saldo)? si aggancia lì: niente doppioni
      const gia = cliente ? await tx.scadenza.findFirst({
        where: { tipo: "INCASSO", clienteId: cliente.id, commessaId: { not: null }, fatturaVenditaId: null, stato: { in: ["APERTA", "PARZIALE"] }, importo: { gte: r.importo - 1, lte: r.importo + 1 } },
      }) : null;
      let id: string;
      if (gia) {
        await tx.scadenza.update({ where: { id: gia.id }, data: { fatturaVenditaId: fv.id, numeroDocumento: d.numero, note: [gia.note, `Fattura ${d.numero} (BConsole) agganciata a questo incasso della commessa [rata BC ${r.bcId}]`].filter(Boolean).join("\n") } });
        id = gia.id;
      } else {
        id = (await tx.scadenza.create({
          data: {
            tipo: "INCASSO", descrizione: `Fattura ${d.numero} del ${dataIt(d.data)}${rate.length > 1 ? ` — ${r.descrizione || `rata ${i + 1}/${rate.length}`}` : ""}`,
            controparte: cliente?.nome ?? d.controparte, clienteId: cliente?.id ?? null, origine: "FATTURA_VENDITA", chiaveImport: `BCV:${r.bcId}`,
            importo: cent(Math.abs(r.importo)), dataScadenza: r.scadenza ? data12(r.scadenza) : data12(d.data), dataModificata: true,
            numeroDocumento: d.numero, categoria: "Vendite", brand: brand ?? "P&C", fatturaVenditaId: fv.id,
          },
        })).id;
      }
      await allineaScadenza(tx, id, r);
      if (["PAGATA", "RITENUTA"].includes(statoRata(r.stato))) e.rateSaldate++; else if (statoRata(r.stato) !== "STORNATA") e.rateAperte++;
    }
  }, { timeout: 30000 });
  e.nuove++;
}

async function trovaCliente(d: DocumentoBC) {
  const sel = { id: true, nome: true, brand: { select: { nome: true } } } as const;
  if (d.bcAnagrafica) { const c = await prisma.cliente.findFirst({ where: { bconsoleId: d.bcAnagrafica }, select: sel }); if (c) return c; }
  const p = pivaNorm(d.partitaIva);
  if (p) { const c = await prisma.cliente.findFirst({ where: { piva: { contains: p } }, select: sel }); if (c) return c; }
  if (d.codiceFiscale) { const c = await prisma.cliente.findFirst({ where: { codiceFiscale: { equals: d.codiceFiscale, mode: "insensitive" } }, select: sel }); if (c) return c; }
  const n = nomeNorm(d.controparte);
  if (!n) return null;
  const cand = await prisma.cliente.findMany({ where: { AND: n.split(" ").slice(0, 3).map((w) => ({ nome: { contains: w, mode: "insensitive" as const } })) }, select: sel, take: 20 });
  const uguali = cand.filter((c) => nomeNorm(c.nome) === n);
  return uguali.length === 1 ? uguali[0] : null;
}

// ======================= ACQUISTI =======================

export async function importaAcquistoBC(d: DocumentoBC, e: Esito, prova = false) {
  const chiave = `BCA|${d.bcId}`;
  const forn = await trovaFornitore(d, e, prova);
  const anno = d.data.slice(0, 4);
  const tipo = tipoDocumento(d);
  // già caricata (da questo import, oppure dall'XML del cassetto fiscale con lo stesso numero e fornitore)
  const esiste = await prisma.fatturaAcquisto.findFirst({
    where: {
      OR: [
        { chiave },
        { chiave: chiaveFattura(pivaNorm(d.partitaIva) || null, forn?.ragioneSociale ?? d.controparte, tipo, d.numero, d.data) },
        // stesso fornitore, numero e anno, e stesso segno (una nota di credito non è il doppione di una fattura)
        ...(forn ? [{ fornitoreId: forn.id, numero: d.numero, totale: tipo === "TD04" ? { lt: 0 } : { gte: 0 }, data: { gte: new Date(`${anno}-01-01T00:00:00Z`), lt: new Date(`${Number(anno) + 1}-01-01T00:00:00Z`) } }] : []),
      ],
    },
  });
  const rate = d.rate.filter((r) => r.importo !== 0);
  if (esiste) {
    if (prova) { e.invariate++; return; }
    let cambiate = 0;
    if (!esiste.progetto && d.progetti?.length) { await prisma.fatturaAcquisto.update({ where: { id: esiste.id }, data: { progetto: d.progetti[0] } }); cambiate++; }
    for (const r of rate) {
      const s = await prisma.scadenza.findFirst({ where: { chiaveImport: `FA:${esiste.id}:bc${r.bcId}` }, select: { id: true } });
      if (s && (await prisma.$transaction((tx) => allineaScadenza(tx, s.id, r)))) cambiate++;
    }
    if (!esiste.chiave.startsWith("BCA|")) e.doppie++; else if (cambiate) e.aggiornate++; else e.invariate++;
    return;
  }
  if (prova) { e.nuove++; return; }
  const segno = tipo === "TD04" ? -1 : 1;
  const brand = marchioDa(d.tipologia);
  await prisma.$transaction(async (tx) => {
    const fa = await tx.fatturaAcquisto.create({
      data: {
        chiave, fornitoreId: forn?.id ?? null, fornitoreNome: forn?.ragioneSociale ?? d.controparte, partitaIva: pivaNorm(d.partitaIva) || null,
        tipoDocumento: tipo, numero: d.numero, data: data12(d.data),
        imponibile: cent(segno * Math.abs(d.imponibile)), iva: cent(segno * Math.abs(d.iva)), totale: cent(segno * Math.abs(d.totale)),
        divisione: "P&C", stato: "REGISTRATA", origine: "BCONSOLE", progetto: d.progetti?.[0] ?? null, registrataIl: new Date(), registrataDaNome: "Import BConsole", creatoDaNome: "Import BConsole",
        note: [`Importata da BConsole (protocollo ${d.protocollo || d.bcId})`, d.progetti?.length ? `progetti BConsole ${d.progetti.join(", ")}` : "", brand ? `centro di costo ${brand}` : "", d.riferimento ? d.riferimento.slice(0, 300) : ""].filter(Boolean).join(" · "),
        righe: { create: [{ posizione: 1, descrizione: (d.riferimento?.trim() || "Totale fattura").slice(0, 500), importo: cent(segno * Math.abs(d.imponibile)) }] },
      },
    });
    if (tipo === "TD04") return; // nota di credito: riduce il debito, nessuna scadenza
    for (const [i, r] of rate.entries()) {
      const s = await tx.scadenza.create({
        data: {
          tipo: "PAGAMENTO", descrizione: `${tipo === "PROFORMA" ? "Proforma" : "Fattura"} ${d.numero} del ${dataIt(d.data)}${rate.length > 1 ? ` — ${r.descrizione || `rata ${i + 1}/${rate.length}`}` : ""}`,
          controparte: forn?.ragioneSociale ?? d.controparte, soggettoId: forn?.id ?? null, origine: "FATTURA_ACQUISTO", chiaveImport: `FA:${fa.id}:bc${r.bcId}`,
          importo: cent(Math.abs(r.importo)), dataScadenza: r.scadenza ? data12(r.scadenza) : data12(d.data), dataModificata: true,
          numeroDocumento: d.numero, categoria: "Acquisti", brand: brand ?? "P&C",
        },
      });
      await allineaScadenza(tx, s.id, r);
      if (["PAGATA", "RITENUTA"].includes(statoRata(r.stato))) e.rateSaldate++; else if (statoRata(r.stato) !== "STORNATA") e.rateAperte++;
    }
  }, { timeout: 30000 });
  e.nuove++;
}

/** Fornitore per P.IVA, codice fiscale o nome; se non c'è si crea (senza doppioni). */
async function trovaFornitore(d: DocumentoBC, e: Esito, prova: boolean) {
  const sel = { id: true, ragioneSociale: true } as const;
  const p = pivaNorm(d.partitaIva);
  if (p) {
    const tutti = await prisma.soggetto.findMany({ where: { partitaIva: { contains: p } }, select: { ...sel, partitaIva: true } });
    const f = tutti.find((s) => pivaNorm(s.partitaIva) === p);
    if (f) return f;
  }
  if (d.codiceFiscale) { const f = await prisma.soggetto.findFirst({ where: { codiceFiscale: { equals: d.codiceFiscale, mode: "insensitive" } }, select: sel }); if (f) return f; }
  const n = nomeNorm(d.controparte);
  const cand = n ? await prisma.soggetto.findMany({ where: { ragioneSociale: { contains: d.controparte.trim().split(/\s+/)[0], mode: "insensitive" } }, select: sel, take: 50 }) : [];
  const f = cand.find((c) => nomeNorm(c.ragioneSociale) === n);
  if (f) return f;
  if (prova) return null;
  e.fornitoriCreati++;
  return prisma.soggetto.create({
    data: { ragioneSociale: d.controparte.trim(), ruoli: ["FORNITORE"], partitaIva: p || null, codiceFiscale: d.codiceFiscale || null, note: "Creato dall'import della contabilità BConsole" },
    select: sel,
  });
}
