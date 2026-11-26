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
  /** imponibile del contratto */
  imponibile: number;
  /** servizi e pratiche a costo netto (ENEA, autoscala…) che non vanno in provvigione: si tolgono dall'imponibile */
  servizi?: number;
  /** quanto deve pagare il cliente (IVA compresa): totale della commessa o fatturato BConsole */
  dovuto: number;
  fatture: string[];
  href?: string | null;
  pagamenti: Pagamento[];
  provvigione: ProvvigioneR | null;
  /** giorno in cui la posa è stata finita (solo contratti del CRM con lavori eseguiti) */
  posatoIl?: Date | null;
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

// Regola di Debora (23/11/2026): la provvigione si paga 80% a titolo di acconto e 20% a saldo.
//  - 80% matura quando il cliente ha pagato almeno il 50% della commessa;
//  - 20% matura quando la pratica è posata E il cliente ha pagato tutto (saldo del materiale compreso).
// Una sola fonte di verità: `maturazioneProvvigione`. La usano la pagina Contratti, la stampa, i totali e il report mensile
// (`provvigioneDaPagare`, che la guarda "a fine mese" invece che "adesso").

export const QUOTA_ACCONTO_PROVV = 0.8;
export const SOGLIA_INCASSO_ACCONTO = 0.5;

export type StatoSaldoProvv = "MATURATO" | "NO" | "DA_VERIFICARE";

export type MaturazioneProvvigione = {
  /** 80% a titolo di acconto */
  quotaAcconto: number;
  /** 20% a saldo */
  quotaSaldo: number;
  accontoOk: boolean;
  saldoStato: StatoSaldoProvv;
  accontoMaturato: number;
  saldoMaturato: number;
  maturato: number;
  /** quanto aveva pagato il cliente alla data guardata */
  incassatoEntro: number;
  /** cosa manca, in parole semplici */
  note: string[];
};

/**
 * Cosa è maturato della provvigione di un contratto. Senza `fine` si guarda la situazione di adesso (pagina Contratti);
 * con `fine` si guarda com'era a quella data (report di inizio mese: solo pagamenti e posa fino a `fine`).
 * Per i contratti BConsole la posa non è nota: il saldo resta «da verificare» (non maturato).
 */
export function maturazioneProvvigione(
  c: Pick<Contratto, "dovuto" | "pagamenti" | "provvigione" | "posatoIl" | "origine">,
  fine?: Date | null,
): MaturazioneProvvigione {
  const p = c.provvigione;
  const importo = p?.importo ?? 0;
  const quotaAcconto = cent(importo * QUOTA_ACCONTO_PROVV);
  const quotaSaldo = cent(importo - quotaAcconto);
  const vuoto = { quotaAcconto, quotaSaldo, accontoOk: false, saldoStato: "NO" as StatoSaldoProvv, accontoMaturato: 0, saldoMaturato: 0, maturato: 0, incassatoEntro: 0, note: [] as string[] };
  if (!p || importo <= 0) return vuoto;
  const { dovuto } = riepilogoPagamenti(c);
  if (dovuto <= 0) return { ...vuoto, note: ["contratto senza importi"] };
  const incassatoEntro = cent(c.pagamenti
    .filter((x) => x.stato !== "ANNULLATA" && x.stato !== "SOSTITUITA" && (!fine || (x.ultimoIncasso && x.ultimoIncasso.getTime() <= fine.getTime())))
    .reduce((t, x) => t + x.incassato, 0));
  const accontoOk = incassatoEntro >= dovuto * SOGLIA_INCASSO_ACCONTO - 0.005;
  const tuttoPagato = incassatoEntro >= dovuto - 0.5;
  const posato = !!c.posatoIl && (!fine || c.posatoIl.getTime() <= fine.getTime());
  const saldoMaturo = tuttoPagato && posato;
  const note: string[] = [];
  if (!accontoOk) note.push("il cliente non ha pagato il 50%");
  if (!posato) note.push(c.origine === "BCONSOLE" ? "posa non registrata in ONE: saldo da verificare" : "pratica non posata");
  if (posato && !tuttoPagato) note.push("il cliente non ha pagato tutto");
  const saldoStato: StatoSaldoProvv = saldoMaturo ? "MATURATO" : !posato && c.origine === "BCONSOLE" ? "DA_VERIFICARE" : "NO";
  const accontoMaturato = accontoOk ? quotaAcconto : 0;
  const saldoMaturato = saldoMaturo ? quotaSaldo : 0;
  return { quotaAcconto, quotaSaldo, accontoOk, saldoStato, accontoMaturato, saldoMaturato, maturato: cent(accontoMaturato + saldoMaturato), incassatoEntro, note };
}

/** Provvigione del contratto: maturata (80/20), già liquidata, da liquidare (= maturata − già liquidata). */
export function riepilogoProvvigione(c: Pick<Contratto, "dovuto" | "pagamenti" | "provvigione" | "posatoIl" | "origine">, fine?: Date | null) {
  const p = c.provvigione;
  if (!p) return { stato: "DA_CONTROLLARE" as StatoProvvigione, importo: 0, maturata: 0, liquidata: 0, daLiquidare: 0, futura: 0, accontoOk: false, saldoStato: "NO" as StatoSaldoProvv, quotaAcconto: 0, quotaSaldo: 0, note: [] as string[] };
  const m = maturazioneProvvigione(c, fine);
  const maturata = m.maturato;
  const liquidata = cent(p.liquidazioni.reduce((s, l) => s + l.importo, 0));
  const daLiquidare = cent(Math.max(0, maturata - liquidata));
  const futura = cent(Math.max(0, p.importo - Math.max(maturata, liquidata)));
  const stato: StatoProvvigione = liquidata >= p.importo - 0.005 ? "LIQUIDATA" : daLiquidare > 0.005 ? "DA_LIQUIDARE" : "IN_MATURAZIONE";
  return { stato, importo: p.importo, maturata, liquidata, daLiquidare, futura, accontoOk: m.accontoOk, saldoStato: m.saldoStato, quotaAcconto: m.quotaAcconto, quotaSaldo: m.quotaSaldo, note: m.note };
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
  return Object.entries(sigle).filter(([, user]) => user === u.username || stessaPersona(u.nome, nomi[user] ?? "")).map(([s]) => s);
}

/** Stessa persona anche se un nome è più corto o in altro ordine: «Paolo Visconti» = «Gian Paolo Visconti» = «VISCONTI GIAN PAOLO». */
export function stessaPersona(a: string, b: string): boolean {
  const parole = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 1));
  const pa = parole(a), pb = parole(b);
  if (pa.size < 2 || pb.size < 2) return false;
  const [corto, lungo] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  return [...corto].every((x) => lungo.has(x));
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

// ---------- provvigioni da pagare ogni mese (Debora 23/11/2026) ----------
// Stessa regola 80/20 di `maturazioneProvvigione`, guardata alla fine del mese precedente a quello del report.

/** Ultimo istante del mese precedente a quello del report (mese 1-12). */
export function fineMesePrecedente(anno: number, mese: number): Date {
  return new Date(Date.UTC(anno, mese - 1, 1) - 1);
}

export type ProvvigioneDaPagare = MaturazioneProvvigione & { giaPagato: number; daPagare: number };

export function provvigioneDaPagare(c: Pick<Contratto, "dovuto" | "pagamenti" | "provvigione" | "posatoIl" | "origine">, fine: Date): ProvvigioneDaPagare | null {
  const p = c.provvigione;
  if (!p || p.importo <= 0 || c.dovuto <= 0) return null;
  const m = maturazioneProvvigione(c, fine);
  const giaPagato = cent(p.liquidazioni.reduce((t, l) => t + l.importo, 0));
  return { ...m, giaPagato, daPagare: cent(Math.max(0, m.maturato - giaPagato)) };
}
