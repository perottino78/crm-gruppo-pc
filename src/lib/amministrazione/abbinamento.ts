// Suggerimenti di abbinamento movimento bancario ↔ scadenza. Funzioni pure.
import { cent } from "./estratto";

export type ScadenzaPerAbbinamento = {
  id: string;
  tipo: string; // INCASSO | PAGAMENTO
  controparte: string;
  numeroDocumento: string | null;
  descrizione: string;
  residuo: number; // importo ancora da incassare/pagare (positivo)
  dataScadenza: Date | null;
  origine?: string; // COMMESSA_ACCONTO | COMMESSA_SALDO | MANUALE
};

export type Suggerimento = { scadenzaId: string; punteggio: number; sicuro: boolean; motivi: string[] };

const pulisci = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/g, " ");
const PAROLE_VUOTE = new Set(["SRL", "SAS", "SNC", "SPA", "S", "R", "L", "DI", "DEL", "DELLA", "DE", "LA", "IL", "E", "AND", "STUDIO", "DITTA", "SOC", "SOCIETA"]);

function paroleNome(nome: string): string[] {
  return pulisci(nome).split(/\s+/).filter((p) => p.length >= 3 && !PAROLE_VUOTE.has(p));
}

/** Quante parole significative del nome compaiono nella descrizione del movimento. */
export function corrispondenzaNome(nome: string, descrizione: string): number {
  const parole = paroleNome(nome);
  if (!parole.length) return 0;
  const d = ` ${pulisci(descrizione).replace(/\s+/g, " ")} `;
  return parole.filter((p) => d.includes(` ${p} `)).length / parole.length;
}

function documentoCitato(numero: string | null, descrizione: string): boolean {
  if (!numero) return false;
  const n = pulisci(numero).replace(/\s+/g, "");
  const cifre = n.match(/\d+/g);
  if (!cifre) return false;
  const principale = cifre.sort((a, b) => b.length - a.length)[0];
  if (principale.length < 2) return false;
  return new RegExp(`(^|[^0-9])0*${principale}([^0-9]|$)`).test(pulisci(descrizione));
}

/**
 * Propone le scadenze adatte a un movimento. È "sicuro" solo se l'importo coincide al centesimo
 * E il nome della controparte (o il numero di fattura) compare nella causale, E nessun'altra
 * scadenza ha lo stesso punteggio.
 */
export function suggerisci(movimento: { importo: number; descrizione: string; data: Date }, scadenze: ScadenzaPerAbbinamento[], max = 3): Suggerimento[] {
  const tipo = movimento.importo > 0 ? "INCASSO" : "PAGAMENTO";
  const imp = cent(Math.abs(movimento.importo));
  const out: Suggerimento[] = [];
  for (const s of scadenze) {
    if (s.tipo !== tipo || s.residuo <= 0.004) continue;
    const motivi: string[] = [];
    let p = 0;
    const stessoImporto = Math.abs(cent(s.residuo) - imp) < 0.005;
    if (stessoImporto) { p += 50; motivi.push("stesso importo"); }
    else if (imp < s.residuo) { p += 5; motivi.push("pagamento parziale"); }
    const nome = corrispondenzaNome(s.controparte, movimento.descrizione);
    if (nome >= 0.99) { p += 35; motivi.push("nome nella causale"); }
    else if (nome >= 0.5) { p += 20; motivi.push("nome simile"); }
    if (documentoCitato(s.numeroDocumento, movimento.descrizione)) { p += 30; motivi.push("n° documento nella causale"); }
    // la causale parla di acconto ma la scadenza è un saldo (o viceversa): mai automatico
    const causale = pulisci(movimento.descrizione);
    const contraddice = (s.origine === "COMMESSA_SALDO" && /\bACCONTO\b/.test(causale) && !/\bSALDO\b/.test(causale))
      || (s.origine === "COMMESSA_ACCONTO" && /\bSALDO\b/.test(causale) && !/\bACCONTO\b/.test(causale));
    if (contraddice) { p -= 40; motivi.push("attenzione: la causale parla di " + (s.origine === "COMMESSA_SALDO" ? "acconto" : "saldo")); }
    if (s.dataScadenza) {
      const giorni = Math.abs(movimento.data.getTime() - s.dataScadenza.getTime()) / 86400000;
      if (giorni <= 15) { p += 5; motivi.push("data vicina"); }
    }
    if (p >= 50 || (stessoImporto && p >= 10) || (p >= 35 && !stessoImporto && imp < s.residuo)) {
      out.push({ scadenzaId: s.id, punteggio: p, sicuro: stessoImporto && p >= 85 && !contraddice, motivi });
    }
  }
  out.sort((a, b) => b.punteggio - a.punteggio);
  // se due candidati "sicuri" hanno lo stesso punteggio, nessuno dei due è sicuro
  if (out.length > 1 && out[0].sicuro && out[1].punteggio === out[0].punteggio) {
    out.forEach((o) => (o.sicuro = false));
  }
  for (let i = 1; i < out.length; i++) out[i].sicuro = false;
  return out.slice(0, max);
}
