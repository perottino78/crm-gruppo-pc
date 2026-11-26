// Report di inizio mese «Provvigioni da pagare» (Debora 23/11/2026): per ogni commerciale i contratti che lo compongono.
// Modulo puro: lo usano la pagina /contratti/da-pagare e l'esportazione Excel. Test in tests/provvigioni/report.test.ts.
import { cent, fineMesePrecedente, provvigioneDaPagare, type Contratto, type ProvvigioneDaPagare } from "./calcoli";

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export type RigaReport = { c: Contratto; r: ProvvigioneDaPagare };
export type GruppoReport = { commercialeId: string | null; nome: string; righe: RigaReport[]; maturato: number; giaPagato: number; daPagare: number };

/** «2026-11» del mese precedente a quello dato (formato AAAA-MM). */
export function mesePrecedenteDi(chiaveMese: string): string {
  const anno = Number(chiaveMese.slice(0, 4)), m = Number(chiaveMese.slice(5, 7));
  const d = new Date(Date.UTC(anno, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Report del mese `chiaveMese` (AAAA-MM): si guarda la situazione alla fine del mese precedente. */
export function reportMensile(contratti: Contratto[], chiaveMese: string): { fine: Date; gruppi: GruppoReport[]; totaleDaPagare: number } {
  const fine = fineMesePrecedente(Number(chiaveMese.slice(0, 4)), Number(chiaveMese.slice(5, 7)));
  const perPersona = new Map<string, GruppoReport>();
  for (const c of contratti) {
    const r = provvigioneDaPagare(c, fine);
    if (!r || !(r.daPagare > 0 || r.maturato > 0 || r.giaPagato > 0)) continue;
    const k = c.commercialeId ?? `?${c.commercialeNome}`;
    const g = perPersona.get(k) ?? { commercialeId: c.commercialeId, nome: c.commercialeNome || "—", righe: [], maturato: 0, giaPagato: 0, daPagare: 0 };
    g.righe.push({ c, r });
    g.maturato = cent(g.maturato + r.maturato);
    g.giaPagato = cent(g.giaPagato + r.giaPagato);
    g.daPagare = cent(g.daPagare + r.daPagare);
    perPersona.set(k, g);
  }
  const gruppi = [...perPersona.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  for (const g of gruppi) g.righe.sort((a, b) => a.c.clienteNome.localeCompare(b.c.clienteNome));
  return { fine, gruppi, totaleDaPagare: cent(gruppi.reduce((t, g) => t + g.daPagare, 0)) };
}

const cella = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number) => n.toFixed(2).replace(".", ",");

/** CSV con «;» e virgola decimale (si apre in Excel italiano), una riga per contratto. */
export function csvReport(gruppi: GruppoReport[]): string {
  const righe: (string | number)[][] = [["Commerciale", "Cliente", "Contratto", "Provvigione", "Quota 80% acconto maturata", "Quota 20% saldo maturata", "Maturato", "Già pagato", "Da pagare", "Cosa manca"]];
  for (const g of gruppi) {
    for (const { c, r } of g.righe) {
      righe.push([g.nome, c.clienteNome, c.numero, num(c.provvigione!.importo), num(r.accontoMaturato), num(r.saldoMaturato), num(r.maturato), num(r.giaPagato), num(r.daPagare), r.note.join(" · ")]);
    }
    righe.push([`Totale ${g.nome}`, "", "", "", "", "", num(g.maturato), num(g.giaPagato), num(g.daPagare), ""]);
  }
  return "﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n") + "\r\n";
}
