// Importazione listini: riconosce le colonne del foglio, confronta ogni riga con gli articoli già in
// anagrafica e prepara l'anteprima (nuovi, modificati con prima/dopo, invariati, errori, avvisi).
// Nessuna scrittura qui: la conferma avviene in articoli-actions. Funzioni pure, testate.
import { leggiNumero, leggiSconti, scriviSconti, calcolaArticolo, type CategoriaRegola, UNITA } from "./prezzi";
import type { Tabella } from "./foglio";

export type Campo =
  | "codice" | "codiceFornitore" | "descrizione" | "descrizioneEstesa" | "categoria" | "sottocategoria" | "fornitore" | "marca"
  | "divisione" | "um" | "aliquotaIva" | "prezzoListino" | "sconti" | "costoAcquisto" | "metodoPrezzo" | "ricarico" | "margine"
  | "prezzoVendita" | "ean" | "immagineUrl" | "note" | "attivo";

/** Colonne del modello, nell'ordine in cui compaiono nel file da scaricare. */
export const COLONNE: { campo: Campo; titolo: string; sinonimi: string[]; larghezza: number; spiegazione: string }[] = [
  { campo: "codice", titolo: "CODICE", sinonimi: ["CODICE", "COD", "CODICE ARTICOLO", "COD ARTICOLO", "CODICE INTERNO", "SKU"], larghezza: 14, spiegazione: "Codice interno P&C. Se lo lasci vuoto: per un articolo nuovo si usa il codice fornitore (o ne viene creato uno), per uno esistente si cerca con fornitore + codice fornitore." },
  { campo: "codiceFornitore", titolo: "CODICE FORNITORE", sinonimi: ["CODICE FORNITORE", "COD FORNITORE", "COD FORN", "CODICE PRODUTTORE", "RIF FORNITORE", "ARTICOLO FORNITORE", "CODICE ARTICOLO FORNITORE"], larghezza: 16, spiegazione: "Codice con cui il fornitore conosce l'articolo (va sugli ordini)." },
  { campo: "descrizione", titolo: "DESCRIZIONE", sinonimi: ["DESCRIZIONE", "DESCRIZIONE ARTICOLO", "DESCR", "PRODOTTO", "NOME", "DENOMINAZIONE"], larghezza: 40, spiegazione: "Obbligatoria per gli articoli nuovi." },
  { campo: "descrizioneEstesa", titolo: "DESCRIZIONE ESTESA", sinonimi: ["DESCRIZIONE ESTESA", "DESCRIZIONE LUNGA", "DETTAGLI", "CARATTERISTICHE"], larghezza: 30, spiegazione: "Testo lungo facoltativo (caratteristiche tecniche)." },
  { campo: "categoria", titolo: "CATEGORIA", sinonimi: ["CATEGORIA", "FAMIGLIA", "GRUPPO MERCEOLOGICO"], larghezza: 18, spiegazione: "Se non esiste viene creata. Dalla categoria dipende la regola di prezzo." },
  { campo: "sottocategoria", titolo: "SOTTOCATEGORIA", sinonimi: ["SOTTOCATEGORIA", "SOTTO CATEGORIA", "SOTTOFAMIGLIA", "SOTTOGRUPPO"], larghezza: 18, spiegazione: "Facoltativa; se non esiste viene creata sotto la categoria." },
  { campo: "fornitore", titolo: "FORNITORE", sinonimi: ["FORNITORE", "RAGIONE SOCIALE FORNITORE"], larghezza: 24, spiegazione: "Nome come in anagrafica. Se manca vale il fornitore scelto al caricamento." },
  { campo: "marca", titolo: "MARCA", sinonimi: ["MARCA", "BRAND", "PRODUTTORE"], larghezza: 14, spiegazione: "Facoltativa." },
  { campo: "divisione", titolo: "DIVISIONE", sinonimi: ["DIVISIONE", "SOCIETA"], larghezza: 14, spiegazione: "P&C, Solaris, PTC, Purafonte, Work & Services." },
  { campo: "um", titolo: "UM", sinonimi: ["UM", "U M", "UNITA DI MISURA", "UNITA", "UDM"], larghezza: 6, spiegazione: `Unità di misura: ${UNITA.join(", ")}. Vuota = pz.` },
  { campo: "aliquotaIva", titolo: "IVA %", sinonimi: ["IVA", "ALIQUOTA IVA", "ALIQUOTA", "IVA PERCENTUALE"], larghezza: 7, spiegazione: "22, 10, 4 o 0. Vuota = 22." },
  { campo: "prezzoListino", titolo: "PREZZO LISTINO", sinonimi: ["PREZZO LISTINO", "LISTINO", "PREZZO DI LISTINO", "PREZZO PUBBLICO", "LISTINO FORNITORE", "PREZZO"], larghezza: 14, spiegazione: "Prezzo di listino del fornitore, prima degli sconti." },
  { campo: "sconti", titolo: "SCONTI", sinonimi: ["SCONTI", "SCONTO", "SCONTI ACQUISTO", "SCONTO ACQUISTO", "SCONTO FORNITORE"], larghezza: 10, spiegazione: "Sconti d'acquisto a cascata, es. 50+10. Vuoto su un articolo nuovo = sconto del fornitore in anagrafica." },
  { campo: "costoAcquisto", titolo: "COSTO NETTO", sinonimi: ["COSTO NETTO", "COSTO", "COSTO ACQUISTO", "PREZZO ACQUISTO", "NETTO", "PREZZO NETTO", "COSTO UNITARIO"], larghezza: 12, spiegazione: "Da compilare solo se non c'è il listino: il costo già scontato." },
  { campo: "metodoPrezzo", titolo: "METODO PREZZO", sinonimi: ["METODO PREZZO", "METODO", "REGOLA PREZZO"], larghezza: 14, spiegazione: "Vuoto = regola della categoria. RICARICO, MARGINE oppure MANUALE (prezzo di vendita scritto a mano)." },
  { campo: "ricarico", titolo: "RICARICO (×)", sinonimi: ["RICARICO", "RICARICO X", "COEFFICIENTE", "MOLTIPLICATORE", "COEFFICIENTE RICARICO"], larghezza: 11, spiegazione: "Coefficiente sul costo, es. 3,3. Se scrivi una percentuale (es. 30%) diventa ×1,3." },
  { campo: "margine", titolo: "MARGINE %", sinonimi: ["MARGINE", "MARGINE PERCENTUALE", "MARGINE DESIDERATO"], larghezza: 10, spiegazione: "Margine desiderato sul prezzo di vendita, es. 40." },
  { campo: "prezzoVendita", titolo: "PREZZO VENDITA", sinonimi: ["PREZZO VENDITA", "VENDITA", "PREZZO DI VENDITA", "PREZZO CLIENTE", "PV", "PREZZO VENDITA IVA ESCLUSA"], larghezza: 14, spiegazione: "IVA esclusa. Usato se il metodo è MANUALE o se non c'è nessuna regola; altrimenti il prezzo lo calcola il CRM." },
  { campo: "ean", titolo: "EAN", sinonimi: ["EAN", "BARCODE", "CODICE A BARRE", "EAN13"], larghezza: 15, spiegazione: "Facoltativo." },
  { campo: "immagineUrl", titolo: "IMMAGINE (URL)", sinonimi: ["IMMAGINE", "IMMAGINE URL", "FOTO", "URL IMMAGINE", "LINK IMMAGINE"], larghezza: 24, spiegazione: "Indirizzo web della foto (facoltativo)." },
  { campo: "note", titolo: "NOTE", sinonimi: ["NOTE", "NOTA", "ANNOTAZIONI"], larghezza: 24, spiegazione: "Facoltative." },
  { campo: "attivo", titolo: "ATTIVO", sinonimi: ["ATTIVO", "ABILITATO", "IN USO"], larghezza: 8, spiegazione: "SI / NO. Vuoto = SI. Gli articoli non attivi non compaiono negli ordini." },
];

export const DIVISIONI = ["P&C", "Solaris", "PTC", "Purafonte", "Work & Services"];

export const norm = (s: unknown) =>
  String(s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()×%.,/\\:_#°\-'"]/g, " ").replace(/\s+/g, " ").trim();

/** Trova la riga di intestazione e a quale colonna corrisponde ogni campo. */
export function mappaColonne(tab: Tabella): { riga: number; mappa: Partial<Record<Campo, number>>; ignorate: string[] } | null {
  for (let i = 0; i < Math.min(tab.length, 25); i++) {
    const h = (tab[i] ?? []).map(norm);
    const mappa: Partial<Record<Campo, number>> = {};
    const usate = new Set<number>();
    // prima i titoli esatti, poi i sinonimi (così "PREZZO" non ruba la colonna "PREZZO VENDITA")
    for (const c of COLONNE) {
      const k = h.findIndex((x, j) => !usate.has(j) && x === norm(c.titolo));
      if (k >= 0) { mappa[c.campo] = k; usate.add(k); }
    }
    for (const c of COLONNE) {
      if (mappa[c.campo] !== undefined) continue;
      for (const s of c.sinonimi) {
        const k = h.findIndex((x, j) => !usate.has(j) && x === s);
        if (k >= 0) { mappa[c.campo] = k; usate.add(k); break; }
      }
    }
    const trovate = Object.keys(mappa).length;
    const chiave = mappa.descrizione !== undefined || mappa.codice !== undefined || mappa.codiceFornitore !== undefined;
    if (trovate >= 2 && chiave) {
      const ignorate = (tab[i] ?? []).filter((x, j) => String(x).trim() && !usate.has(j)).map(String);
      return { riga: i, mappa, ignorate };
    }
  }
  return null;
}

export type Esistente = {
  id: string; codice: string; codiceFornitore: string | null; fornitoreId: string | null; descrizione: string; descrizioneEstesa: string | null;
  categoriaId: string | null; marca: string | null; divisione: string | null; um: string; aliquotaIva: number; prezzoListino: number | null;
  sconti: string | null; costoAcquisto: number | null; metodoPrezzo: string | null; valorePrezzo: number | null; prezzoVendita: number | null;
  ean: string | null; immagineUrl: string | null; note: string | null; attivo: boolean;
};
export type FornitoreRif = { id: string; ragioneSociale: string; scontoFornitore: number | null };
export type CategoriaRif = CategoriaRegola;
export type Opzioni = { fornitoreId?: string | null; divisione?: string | null; categoriaId?: string | null; soloAggiornamento?: boolean };

/** Dati da scrivere sull'articolo (categoria indicata per nome finché non viene creata). */
export type DatiArticolo = Partial<Omit<Esistente, "id">> & { categoriaNome?: string | null; sottocategoriaNome?: string | null };
export type Modifica = { campo: string; prima: string; dopo: string };
export type RigaAnteprima = {
  riga: number; azione: "NUOVO" | "MODIFICA" | "INVARIATO" | "ERRORE" | "SALTATA";
  articoloId?: string; codice: string | null; descrizione: string; dati: DatiArticolo; modifiche: Modifica[];
  avvisi: string[]; errori: string[]; costo: number | null; vendita: number | null; margine: number | null;
};
export type Anteprima = { righe: RigaAnteprima[]; colonne: string[]; ignorate: string[]; categorieNuove: string[]; errore?: string };

const ETICHETTE: Record<string, string> = {
  codiceFornitore: "Cod. fornitore", descrizione: "Descrizione", descrizioneEstesa: "Descr. estesa", categoria: "Categoria", fornitoreId: "Fornitore",
  marca: "Marca", divisione: "Divisione", um: "UM", aliquotaIva: "IVA", prezzoListino: "Listino", sconti: "Sconti", costoAcquisto: "Costo",
  metodoPrezzo: "Metodo", valorePrezzo: "Valore regola", prezzoVendita: "Vendita", ean: "EAN", immagineUrl: "Immagine", note: "Note", attivo: "Attivo",
};
const testoVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : typeof v === "boolean" ? (v ? "sì" : "no") : String(v));

function trovaFornitore(nome: string, fornitori: FornitoreRif[]): FornitoreRif | undefined {
  const n = norm(nome);
  if (!n) return undefined;
  return fornitori.find((f) => norm(f.ragioneSociale) === n)
    ?? fornitori.find((f) => norm(f.ragioneSociale).replace(/\b(S R L|SRL|S P A|SPA|S A S|SAS|S N C|SNC)\b/g, "").trim() === n.replace(/\b(S R L|SRL|S P A|SPA|S A S|SAS|S N C|SNC)\b/g, "").trim())
    ?? (n.length >= 4 ? fornitori.find((f) => norm(f.ragioneSociale).startsWith(n) || n.startsWith(norm(f.ragioneSociale))) : undefined);
}

/** Analizza le righe del foglio e prepara l'anteprima. */
export function analizzaListino(tab: Tabella, opz: Opzioni, esistenti: Esistente[], fornitori: FornitoreRif[], categorie: CategoriaRif[]): Anteprima {
  const m = mappaColonne(tab);
  if (!m) return { righe: [], colonne: [], ignorate: [], categorieNuove: [], errore: "Non trovo la riga dei titoli: servono almeno DESCRIZIONE (o CODICE / CODICE FORNITORE) e un'altra colonna riconosciuta, come PREZZO LISTINO. Scarica il modello per vedere i nomi delle colonne." };
  const { mappa } = m;
  const perCodice = new Map(esistenti.map((e) => [e.codice.trim().toUpperCase(), e]));
  const perCodForn = new Map(esistenti.filter((e) => e.fornitoreId && e.codiceFornitore).map((e) => [`${e.fornitoreId}|${e.codiceFornitore!.trim().toUpperCase()}`, e]));
  const fornDefault = fornitori.find((f) => f.id === opz.fornitoreId);
  const visti = new Set<string>();
  const categorieNuove = new Set<string>();
  const righe: RigaAnteprima[] = [];
  const catPerNome = (nome: string, padreId: string | null) => categorie.find((c) => (c.padreId ?? null) === padreId && norm(c.nome) === norm(nome));

  for (let i = m.riga + 1; i < tab.length; i++) {
    const r = tab[i] ?? [];
    if (!r.some((x) => String(x ?? "").trim())) continue;
    const v = (c: Campo) => (mappa[c] !== undefined ? String(r[mappa[c]!] ?? "").trim() : "");
    const errori: string[] = [], avvisi: string[] = [];
    const num = (c: Campo, nome: string) => {
      const s = v(c);
      if (!s) return undefined;
      const n = leggiNumero(s);
      if (n === null) { errori.push(`${nome} «${s}» non è un numero`); return undefined; }
      if (n < 0) { errori.push(`${nome} negativo`); return undefined; }
      return n;
    };
    const codice = v("codice"), codForn = v("codiceFornitore"), descr = v("descrizione");
    // salta righe di totali / titoli di sezione senza dati utili
    if (!codice && !codForn && !descr) continue;

    // fornitore
    let fornitore = fornDefault;
    const nomeForn = v("fornitore");
    if (nomeForn) {
      const f = trovaFornitore(nomeForn, fornitori);
      if (f) fornitore = f;
      else avvisi.push(`fornitore «${nomeForn}» non trovato in anagrafica${fornDefault ? `: uso ${fornDefault.ragioneSociale}` : ""}`);
    }

    // articolo esistente
    const chiaveCod = codice.toUpperCase();
    let es = codice ? perCodice.get(chiaveCod) : undefined;
    if (!es && codForn && fornitore) es = perCodForn.get(`${fornitore.id}|${codForn.toUpperCase()}`);
    if (!es && !codice && codForn && !fornitore) es = esistenti.find((e) => (e.codiceFornitore ?? "").toUpperCase() === codForn.toUpperCase() && !e.fornitoreId);
    const chiaveRiga = es ? `id:${es.id}` : codice ? `cod:${chiaveCod}` : codForn ? `forn:${fornitore?.id ?? ""}|${codForn.toUpperCase()}` : `descr:${fornitore?.id ?? ""}|${descr.toUpperCase()}`;
    if (visti.has(chiaveRiga)) {
      righe.push({ riga: i + 1, azione: "ERRORE", codice: codice || es?.codice || null, descrizione: descr || es?.descrizione || codForn, dati: {}, modifiche: [], avvisi: [], errori: ["riga doppia nel file: stesso articolo già presente più sopra"], costo: null, vendita: null, margine: null });
      continue;
    }
    visti.add(chiaveRiga);

    const dati: DatiArticolo = {};
    if (codForn) dati.codiceFornitore = codForn;
    if (descr) dati.descrizione = descr;
    if (v("descrizioneEstesa")) dati.descrizioneEstesa = v("descrizioneEstesa");
    if (fornitore && (nomeForn || !es || !es.fornitoreId)) dati.fornitoreId = fornitore.id;
    if (v("marca")) dati.marca = v("marca");
    const div = v("divisione") || (!es ? opz.divisione ?? "" : "");
    if (div) {
      const d = DIVISIONI.find((x) => norm(x) === norm(div) || norm(x).replace(/ /g, "") === norm(div).replace(/ /g, ""));
      if (d) dati.divisione = d; else avvisi.push(`divisione «${div}» non riconosciuta`);
    }
    if (v("um")) dati.um = v("um").toLowerCase().replace("mq", "m²").replace("m2", "m²").replace("mc", "m³").replace(/^nr?$|^pezzi$|^pz\.$/, "pz");
    const iva = num("aliquotaIva", "IVA");
    if (iva !== undefined) { if (iva > 30) errori.push("IVA oltre il 30%"); else dati.aliquotaIva = iva; }
    const listino = num("prezzoListino", "Prezzo listino");
    if (listino !== undefined) { dati.prezzoListino = listino; if (listino === 0) avvisi.push("prezzo di listino a zero"); }
    const scontiTesto = v("sconti");
    if (scontiTesto) {
      const s = leggiSconti(scontiTesto);
      if (s === null) errori.push(`sconti «${scontiTesto}» non leggibili (scrivi ad es. 50+10)`); else dati.sconti = s.length ? scriviSconti(s) : null;
    } else if (!es && listino !== undefined && fornitore?.scontoFornitore) {
      dati.sconti = scriviSconti([fornitore.scontoFornitore]);
      avvisi.push(`sconto ${fornitore.scontoFornitore}% preso dal fornitore`);
    }
    const costo = num("costoAcquisto", "Costo");
    // il costo netto vale solo se nella riga non c'è il listino (altrimenti il costo si calcola dagli sconti)
    if (costo !== undefined && listino === undefined) {
      dati.costoAcquisto = costo;
      if (es?.prezzoListino !== null && es?.prezzoListino !== undefined) { dati.prezzoListino = null; avvisi.push("il costo netto sostituisce il listino"); }
    }

    // regola di prezzo
    const met = norm(v("metodoPrezzo"));
    const ricTesto = v("ricarico"), marTesto = v("margine");
    let metodo: string | null | undefined;
    if (met) {
      if (met.startsWith("RIC") || met === "COEFFICIENTE") metodo = "RICARICO";
      else if (met.startsWith("MARG")) metodo = "MARGINE";
      else if (met.startsWith("MAN") || met === "FISSO" || met === "A MANO") metodo = "MANUALE";
      else if (met.startsWith("CATEG") || met === "AUTO" || met === "AUTOMATICO") metodo = null;
      else errori.push(`metodo «${v("metodoPrezzo")}» non riconosciuto (RICARICO, MARGINE o MANUALE)`);
    }
    if (ricTesto && metodo !== "MARGINE" && metodo !== "MANUALE") {
      const n = leggiNumero(ricTesto);
      if (n === null || n <= 0) errori.push(`ricarico «${ricTesto}» non valido`);
      else {
        const coeff = /%/.test(ricTesto) || n > 10 ? 1 + n / 100 : n;
        if (coeff < 1) errori.push(`ricarico ×${n}: venderesti sotto costo`);
        else { metodo = "RICARICO"; dati.valorePrezzo = Math.round(coeff * 10000) / 10000; }
      }
    } else if (marTesto && metodo !== "RICARICO" && metodo !== "MANUALE") {
      const n = leggiNumero(marTesto);
      if (n === null || n < 0 || n >= 100) errori.push(`margine «${marTesto}» non valido (tra 0 e 99)`);
      else { metodo = "MARGINE"; dati.valorePrezzo = n; }
    }
    if (metodo === "RICARICO" && dati.valorePrezzo === undefined && !(es?.metodoPrezzo === "RICARICO")) errori.push("metodo RICARICO senza coefficiente");
    if (metodo === "MARGINE" && dati.valorePrezzo === undefined && !(es?.metodoPrezzo === "MARGINE")) errori.push("metodo MARGINE senza percentuale");
    if (metodo !== undefined) { dati.metodoPrezzo = metodo; if (metodo === null || metodo === "MANUALE") dati.valorePrezzo = null; }

    // categoria
    const catNome = v("categoria"), sotNome = v("sottocategoria");
    let categoriaId: string | null | undefined = es?.categoriaId ?? (opz.categoriaId || null);
    let catCalcolo: string | null = null; // per una sottocategoria nuova il prezzo si calcola con la regola della madre
    if (catNome) {
      const c = catPerNome(catNome, null);
      if (c) {
        categoriaId = c.id;
        if (sotNome) {
          const s = catPerNome(sotNome, c.id);
          if (s) categoriaId = s.id; else { categoriaId = undefined; catCalcolo = c.id; dati.categoriaNome = c.nome; dati.sottocategoriaNome = sotNome; categorieNuove.add(`${c.nome} › ${sotNome}`); }
        }
      } else {
        categoriaId = undefined; dati.categoriaNome = catNome; dati.sottocategoriaNome = sotNome || null;
        categorieNuove.add(sotNome ? `${catNome} › ${sotNome}` : catNome);
      }
      if (categoriaId) dati.categoriaId = categoriaId;
    } else if (!es && opz.categoriaId) dati.categoriaId = opz.categoriaId;

    const attivoTesto = norm(v("attivo"));
    if (attivoTesto) dati.attivo = !/^(NO|N|FALSO|FALSE|0|DISATTIVO|NON ATTIVO)$/.test(attivoTesto);
    if (v("ean")) dati.ean = v("ean").replace(/\s/g, "").replace(/,0+$/, "");
    if (v("immagineUrl")) { if (/^https?:\/\//i.test(v("immagineUrl"))) dati.immagineUrl = v("immagineUrl"); else avvisi.push("immagine ignorata: serve un indirizzo che inizi con http"); }
    if (v("note")) dati.note = v("note");

    // prezzo di vendita: dal file solo se a mano o se non esiste una regola
    const unito = { ...(es ?? {}), ...dati } as Esistente & DatiArticolo;
    const catRegola = dati.categoriaNome ? catCalcolo : unito.categoriaId;
    const venditaFile = num("prezzoVendita", "Prezzo vendita");
    const provvisorio = calcolaArticolo({ ...unito, categoriaId: catRegola, prezzoVendita: null }, categorie);
    if (venditaFile !== undefined) {
      if (unito.metodoPrezzo === "MANUALE" || !provvisorio.regola) {
        dati.prezzoVendita = venditaFile;
        if (!unito.metodoPrezzo && !provvisorio.regola && !dati.categoriaNome) { dati.metodoPrezzo = "MANUALE"; }
      } else if (provvisorio.vendita !== null && Math.abs(provvisorio.vendita - venditaFile) > 0.011) {
        avvisi.push(`prezzo vendita nel file ${testoVal(venditaFile)} € ma la regola (${provvisorio.regola.da}) dà ${testoVal(provvisorio.vendita)} €: tengo il calcolato (per forzarlo scrivi MANUALE in METODO PREZZO)`);
      }
    }
    const fin = calcolaArticolo({ ...unito, ...dati, categoriaId: catRegola } as never, categorie);
    if (fin.vendita !== null && fin.regola?.metodo !== "MANUALE") dati.prezzoVendita = fin.vendita;

    // controlli
    if (!es && !descr) errori.push("descrizione mancante per un articolo nuovo");
    if (!es && opz.soloAggiornamento) {
      righe.push({ riga: i + 1, azione: "SALTATA", codice: codice || null, descrizione: descr || codForn, dati: {}, modifiche: [], avvisi: ["articolo non in anagrafica: saltato (hai scelto solo aggiornamento prezzi)"], errori: [], costo: fin.costo, vendita: fin.vendita, margine: fin.margine });
      continue;
    }
    if (fin.costo !== null && fin.vendita !== null && fin.vendita < fin.costo) avvisi.push("vendita sotto il costo");
    else if (fin.sottoMinimo) avvisi.push(`margine ${testoVal(fin.margine)}% sotto il minimo della categoria`);
    if (!es && fin.vendita === null) avvisi.push(dati.categoriaNome && !catCalcolo ? "prezzo di vendita da calcolare dopo aver dato la regola alla nuova categoria" : "senza prezzo di vendita: manca il costo o la regola");
    if (es) {
      const cPrima = calcolaArticolo(es, categorie);
      const varia = (a: number | null, b: number | null) => (a && b ? Math.abs(b - a) / a : 0);
      if (varia(cPrima.costo, fin.costo) > 0.25) avvisi.push(`costo cambia del ${Math.round(((fin.costo! - cPrima.costo!) / cPrima.costo!) * 100)}%`);
      else if (varia(cPrima.vendita, fin.vendita) > 0.25) avvisi.push(`vendita cambia del ${Math.round(((fin.vendita! - cPrima.vendita!) / cPrima.vendita!) * 100)}%`);
    }

    // modifiche rispetto all'esistente
    const modifiche: Modifica[] = [];
    if (es) {
      for (const [k, val] of Object.entries(dati)) {
        if (k === "categoriaNome" || k === "sottocategoriaNome") continue;
        const prima = (es as Record<string, unknown>)[k];
        const uguale = typeof val === "number" && typeof prima === "number" ? Math.abs(val - prima) < 0.005 : (prima ?? null) === (val ?? null);
        if (uguale) { delete (dati as Record<string, unknown>)[k]; continue; }
        const nomeF = (id: unknown) => fornitori.find((f) => f.id === id)?.ragioneSociale ?? "—";
        const nomeC = (id: unknown) => categorie.find((c) => c.id === id)?.nome ?? "—";
        modifiche.push({ campo: ETICHETTE[k] ?? k, prima: k === "fornitoreId" ? nomeF(prima) : k === "categoriaId" ? nomeC(prima) : testoVal(prima), dopo: k === "fornitoreId" ? nomeF(val) : k === "categoriaId" ? nomeC(val) : testoVal(val) });
      }
      if (dati.categoriaNome) modifiche.push({ campo: "Categoria", prima: categorie.find((c) => c.id === es!.categoriaId)?.nome ?? "—", dopo: `${dati.categoriaNome}${dati.sottocategoriaNome ? ` › ${dati.sottocategoriaNome}` : ""} (nuova)` });
    }
    const azione = errori.length ? "ERRORE" : !es ? "NUOVO" : modifiche.length ? "MODIFICA" : "INVARIATO";
    righe.push({ riga: i + 1, azione, articoloId: es?.id, codice: codice || es?.codice || null, descrizione: descr || es?.descrizione || codForn, dati, modifiche, avvisi, errori, costo: fin.costo, vendita: fin.vendita, margine: fin.margine });
  }
  const colonne = COLONNE.filter((c) => mappa[c.campo] !== undefined).map((c) => `${c.titolo} ← «${(tab[m.riga] ?? [])[mappa[c.campo]!]}»`);
  return { righe, colonne, ignorate: m.ignorate, categorieNuove: [...categorieNuove] };
}

/** Riepilogo per contatori e testo. */
export function contaAnteprima(righe: RigaAnteprima[]) {
  const n = (a: RigaAnteprima["azione"]) => righe.filter((r) => r.azione === a).length;
  return { nuovi: n("NUOVO"), modificati: n("MODIFICA"), invariati: n("INVARIATO"), errori: n("ERRORE"), saltate: n("SALTATA"), avvisi: righe.filter((r) => r.avvisi.length && r.azione !== "ERRORE").length };
}
