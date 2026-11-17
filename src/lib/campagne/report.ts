// Report delle campagne per settimana o mese (richiesta di Ugo, nov 2026). Modulo puro: niente database.
export type InvioReport = { stato: string; apertaIl: Date | null; clicIl: Date | null };
export type CampagnaReport = { id: string; nome: string; inviataIl: Date | null; createdAt: Date; invii: InvioReport[] };

export type RigaReport = {
  chiave: string; etichetta: string; campagne: number; destinatari: number; inviate: number; consegnate: number;
  rimbalzate: number; disiscritti: number; fallite: number; aperte: number; clic: number; apertePerc: number; clicPerc: number;
};

const perc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Conta gli invii di una campagna (la «consegnata» = inviata e non rimbalzata). */
export function contaInvii(invii: InvioReport[]) {
  const n = (s: string) => invii.filter((i) => i.stato === s).length;
  const inviate = n("INVIATA");
  const aperte = invii.filter((i) => i.apertaIl || i.clicIl).length;
  const clic = invii.filter((i) => i.clicIl).length;
  const rimbalzate = n("RIMBALZATA");
  return {
    destinatari: invii.length, inviate: inviate + rimbalzate, consegnate: inviate, rimbalzate, disiscritti: n("SOPPRESSA"), fallite: n("FALLITA"),
    aperte, clic, apertePerc: perc(aperte, inviate), clicPerc: perc(clic, inviate),
  };
}

/** Lunedì (ora di Roma) della settimana della data, come «AAAA-MM-GG». */
export function chiaveSettimana(d: Date): string {
  const roma = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const g = (roma.getDay() + 6) % 7;
  roma.setDate(roma.getDate() - g);
  return `${roma.getFullYear()}-${String(roma.getMonth() + 1).padStart(2, "0")}-${String(roma.getDate()).padStart(2, "0")}`;
}
export const chiaveMese = (d: Date) => {
  const r = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}`;
};
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function etichettaPeriodo(chiave: string): string {
  const [a, m, g] = chiave.split("-").map(Number);
  return g ? `Settimana dal ${String(g).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}` : `${MESI[m - 1]} ${a}`;
}

/** Righe del report: una per periodo (dal più recente), sommando le campagne partite in quel periodo. Le mai inviate non contano. */
export function rapportoPerPeriodo(campagne: CampagnaReport[], per: "settimana" | "mese"): RigaReport[] {
  const gruppi = new Map<string, CampagnaReport[]>();
  for (const c of campagne) {
    if (!c.inviataIl || c.invii.length === 0) continue;
    const k = per === "mese" ? chiaveMese(c.inviataIl) : chiaveSettimana(c.inviataIl);
    gruppi.set(k, [...(gruppi.get(k) ?? []), c]);
  }
  return [...gruppi.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([chiave, cs]) => {
    const somma = contaInvii(cs.flatMap((c) => c.invii));
    return { chiave, etichetta: etichettaPeriodo(chiave), campagne: cs.length, ...somma };
  });
}
