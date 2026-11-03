// Area del commerciale: i suoi contratti (commesse del CRM e progetti BConsole), i pagamenti del cliente e le provvigioni.
// Le provvigioni le inserisce l'ufficio fatturazione quando controlla il contratto (percentuale sull'imponibile);
// maturano man mano che il cliente paga e si "liquidano" al commerciale anche in più volte.
// Funzioni pure, testate in tests/provvigioni/provvigioni.test.ts.

export const cent = (n: number) => Math.round(n * 100) / 100;

export type Pagamento = {
  id: string; descrizione: string; importo: number; incassato: number; residuo: number;
  scadenza: Date | null; ultimoIncasso: Date | null; stato: string; documento?: string | null;
};

export type Liquidazione = { id: string; importo: number; data: Date; note?: string | null; registrataDa?: string | null };

export type ProvvigioneR = {
  id: string; base: number; percentuale: number; importo: number; note?: string | null;
  controllataDa?: string | null; controllataIl: Date; liquidazioni: Liquidazione[];
};

export type Contratto = {
  /** "C:<id commessa>" | "BC:<numero progetto>" | "FV:<id fattura>" */
  chiave: string;
  origine: "CRM" | "BCONSOLE";
  numero: string;
  data: Date | null;
  clienteNome: string;
  comune?: string | null;
  marchio?: string | null;
  descrizione?: string | null;
  stato?: string | null;
  commercialeId: string | null;
  commercialeNome: string;
  /** imponibile del contratto (base delle provvigioni) */
  imponibile: number;
  /** quanto deve pagare il cliente (IVA compresa): totale della commessa o fatturato BConsole */
  dovuto: number;
  fatture: string[];
  href?: string | null;
  pagamenti: Pagamento[];
  provvigione: ProvvigioneR | null;
};

// ---------- pagamenti ----------

/** Quanto è stato pagato di una scadenza (al netto di ciò che resta) — annullate/sostituite non contano. */
export function incassatoScadenza(s: { importo: number; residuo: number; stato: string }): number {
  if (s.stato === "ANNULLATA" || s.stato === "SOSTITUITA") return 0;
  return cent(Math.max(0, Math.min(s.importo, s.importo - s.residuo)));
}

export type StatoPagamento = "DA_INCASSARE" | "PARZIALE" | "PAGATO" | "SENZA_IMPORTI";

export function riepilogoPagamenti(c: Pick<Contratto, "dovuto" | "pagamenti">) {
  const validi = c.pagamenti.filter((p) => p.stato !== "ANNULLATA" && p.stato !== "SOSTITUITA");
  const incassato = cent(validi.reduce((s, p) => s + p.incassato, 0));
  const dovuto = cent(Math.max(c.dovuto, validi.reduce((s, p) => s + p.importo, 0)));
  const residuo = cent(Math.max(0, dovuto - incassato));
  const stato: StatoPagamento = dovuto <= 0 ? "SENZA_IMPORTI" : residuo <= 0.5 ? "PAGATO" : incassato > 0 ? "PARZIALE" : "DA_INCASSARE";
  const ultimo = validi.map((p) => p.ultimoIncasso).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { dovuto, incassato, residuo, stato, quota: dovuto > 0 ? Math.min(1, incassato / dovuto) : 0, ultimoIncasso: ultimo };
}

export const NOMI_STATO_PAGAMENTO: Record<StatoPagamento, string> = {
  DA_INCASSARE: "Da incassare", PARZIALE: "Pagato in parte", PAGATO: "Pagato", SENZA_IMPORTI: "Senza importi",
};

// ---------- provvigioni ----------

export const importoProvvigione = (base: number, percentuale: number) => cent((base * percentuale) / 100);

export type StatoProvvigione = "DA_CONTROLLARE" | "IN_MATURAZIONE" | "DA_LIQUIDARE" | "LIQUIDATA";

/** Provvigione del contratto: maturata in proporzione a quanto ha pagato il cliente, liquidata, da liquidare. */
export function riepilogoProvvigione(c: Pick<Contratto, "dovuto" | "pagamenti" | "provvigione">) {
  const p = c.provvigione;
  if (!p) return { stato: "DA_CONTROLLARE" as StatoProvvigione, importo: 0, maturata: 0, liquidata: 0, daLiquidare: 0, futura: 0 };
  const { quota } = riepilogoPagamenti(c);
  const maturata = cent(p.importo * quota);
  const liquidata = cent(p.liquidazioni.reduce((s, l) => s + l.importo, 0));
  const daLiquidare = cent(Math.max(0, maturata - liquidata));
  const futura = cent(Math.max(0, p.importo - Math.max(maturata, liquidata)));
  const stato: StatoProvvigione = liquidata >= p.importo - 0.005 ? "LIQUIDATA" : daLiquidare > 0.005 ? "DA_LIQUIDARE" : "IN_MATURAZIONE";
  return { stato, importo: p.importo, maturata, liquidata, daLiquidare, futura };
}

export const NOMI_STATO_PROVVIGIONE: Record<StatoProvvigione, string> = {
  DA_CONTROLLARE: "Da controllare", IN_MATURAZIONE: "In maturazione", DA_LIQUIDARE: "Da liquidare", LIQUIDATA: "Liquidata",
};

// ---------- contratti BConsole dalle fatture ----------

export type FatturaC = {
  id: string; numero: string; data: Date; clienteNome: string; imponibile: number; totale: number; tipoDocumento: string;
  venditore: string | null; progetto: string | null; brand: string | null; descrizione: string | null; commessaId: string | null;
};
export type ProgettoC = { numero: string; clienteNome: string; descrizione: string | null; tipologia: string | null; stato: string | null; totaleOfferto: number; creatoIl: Date | null };

/** Le note di credito (TD04) tolgono importo. */
export const segno = (tipo: string) => (tipo === "TD04" ? -1 : 1);

/**
 * Raggruppa le fatture BConsole per progetto ("758/26"): ogni progetto è un contratto. Le fatture senza progetto
 * restano contratti a sé. Le fatture già agganciate a una commessa del CRM non si contano qui (stanno nella commessa).
 */
export type ContrattoBC = Omit<Contratto, "commercialeId" | "commercialeNome" | "pagamenti" | "provvigione" | "href"> & { idFatture: string[]; venditore: string | null };

export function contrattiDaFatture(fatture: FatturaC[], progetti: Map<string, ProgettoC>): ContrattoBC[] {
  const gruppi = new Map<string, FatturaC[]>();
  for (const f of fatture) {
    if (f.commessaId) continue;
    const k = f.progetto?.trim() ? `BC:${f.progetto.trim()}` : `FV:${f.id}`;
    gruppi.set(k, [...(gruppi.get(k) ?? []), f]);
  }
  return [...gruppi.entries()].map(([chiave, ff]) => {
    ff.sort((a, b) => a.data.getTime() - b.data.getTime());
    const pr = chiave.startsWith("BC:") ? progetti.get(chiave.slice(3)) : undefined;
    const fatturatoImp = cent(ff.reduce((s, f) => s + segno(f.tipoDocumento) * f.imponibile, 0));
    const fatturato = cent(ff.reduce((s, f) => s + segno(f.tipoDocumento) * f.totale, 0));
    return {
      chiave, origine: "BCONSOLE" as const,
      numero: pr?.numero ?? (chiave.startsWith("BC:") ? chiave.slice(3) : `Fatt. ${ff[0].numero}`),
      data: pr?.creatoIl ?? ff[0].data,
      clienteNome: pr?.clienteNome || ff[0].clienteNome,
      marchio: pr?.tipologia || ff[0].brand,
      descrizione: pr?.descrizione || ff.map((f) => f.descrizione).find(Boolean) || null,
      stato: pr?.stato ?? null,
      imponibile: cent(Math.max(pr?.totaleOfferto ?? 0, fatturatoImp)),
      dovuto: fatturato,
      fatture: ff.map((f) => f.numero),
      idFatture: ff.map((f) => f.id),
      venditore: ff.find((f) => f.venditore)?.venditore ?? null,
    };
  });
}

/** Sigle BConsole di un utente (MPI per mpiccatti…): dallo username o, se diverso, dal nome. */
export function sigleDi(u: { username?: string | null; nome: string }, sigle: Record<string, string>, nomi: Record<string, string>): string[] {
  const nome = u.nome.trim().toLowerCase();
  return Object.entries(sigle).filter(([, user]) => user === u.username || (nomi[user] ?? "").toLowerCase() === nome).map(([s]) => s);
}

// ---------- ricerca libera e filtri ----------

export const normalizza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ricerca libera: ogni parola deve comparire da qualche parte (cliente, comune, numero, descrizione, fatture, marchio, stato). */
export function corrisponde(c: Contratto, q: string): boolean {
  const parole = normalizza(q).split(/\s+/).filter(Boolean);
  if (!parole.length) return true;
  const testo = normalizza([c.numero, c.clienteNome, c.comune, c.marchio, c.descrizione, c.stato, c.commercialeNome, ...c.fatture,
    c.data ? c.data.getFullYear() : ""].filter(Boolean).join(" "));
  return parole.every((p) => testo.includes(p));
}

export type Filtri = { q?: string; anno?: string; pagamento?: string; provvigione?: string; origine?: string };

export function filtra(contratti: Contratto[], f: Filtri): Contratto[] {
  return contratti.filter((c) => {
    if (f.q && !corrisponde(c, f.q)) return false;
    if (f.anno && (!c.data || String(c.data.getFullYear()) !== f.anno)) return false;
    if (f.origine && c.origine !== f.origine) return false;
    if (f.pagamento && riepilogoPagamenti(c).stato !== f.pagamento) return false;
    if (f.provvigione && riepilogoProvvigione(c).stato !== f.provvigione) return false;
    return true;
  });
}

/** Totali per le tessere in cima. */
export function totali(contratti: Contratto[]) {
  let venduto = 0, incassato = 0, daIncassare = 0, provvigioni = 0, maturate = 0, liquidate = 0, daLiquidare = 0, daControllare = 0;
  for (const c of contratti) {
    const pg = riepilogoPagamenti(c), pv = riepilogoProvvigione(c);
    venduto += c.imponibile; incassato += pg.incassato; daIncassare += pg.residuo;
    provvigioni += pv.importo; maturate += pv.maturata; liquidate += pv.liquidata; daLiquidare += pv.daLiquidare;
    if (pv.stato === "DA_CONTROLLARE") daControllare++;
  }
  return { contratti: contratti.length, venduto: cent(venduto), incassato: cent(incassato), daIncassare: cent(daIncassare), provvigioni: cent(provvigioni),
    maturate: cent(maturate), liquidate: cent(liquidate), daLiquidare: cent(daLiquidare), daControllare };
}
