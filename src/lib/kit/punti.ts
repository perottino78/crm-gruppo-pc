// Raccolta punti «kit al cliente»: dopo la posa il commerciale consegna il kit P&C e prende punti.
// Regole modificabili dall'amministratore (Configurazione kit_*). Logica pura, testata in tests/kit/punti.test.ts.

export type RegoleKit = {
  puntiConsegna: number; // per ogni kit consegnato e registrato
  puntiFoto: number; // in più se c'è la foto della consegna
  puntiRecensione: number; // in più se il cliente lascia la recensione
  premioMese: string; // es. «Cena per due»
  premioAnno: string;
};

export const REGOLE_KIT_DEFAULT: RegoleKit = { puntiConsegna: 10, puntiFoto: 5, puntiRecensione: 10, premioMese: "", premioAnno: "" };

export const CHIAVI_KIT = {
  puntiConsegna: "kit_punti_consegna",
  puntiFoto: "kit_punti_foto",
  puntiRecensione: "kit_punti_recensione",
  premioMese: "kit_premio_mese",
  premioAnno: "kit_premio_anno",
} as const;

/** Le regole lette dalla Configurazione (valori mancanti o non validi → quelli di serie). */
export function regoleDa(valori: Record<string, string | undefined>): RegoleKit {
  const n = (k: string, d: number) => {
    const x = Number(String(valori[k] ?? "").replace(",", "."));
    return Number.isFinite(x) && x >= 0 && String(valori[k] ?? "").trim() !== "" ? Math.round(x) : d;
  };
  return {
    puntiConsegna: n(CHIAVI_KIT.puntiConsegna, REGOLE_KIT_DEFAULT.puntiConsegna),
    puntiFoto: n(CHIAVI_KIT.puntiFoto, REGOLE_KIT_DEFAULT.puntiFoto),
    puntiRecensione: n(CHIAVI_KIT.puntiRecensione, REGOLE_KIT_DEFAULT.puntiRecensione),
    premioMese: (valori[CHIAVI_KIT.premioMese] ?? "").trim(),
    premioAnno: (valori[CHIAVI_KIT.premioAnno] ?? "").trim(),
  };
}

export function puntiConsegna(c: { conFoto: boolean; recensione: boolean }, r: RegoleKit): number {
  return r.puntiConsegna + (c.conFoto ? r.puntiFoto : 0) + (c.recensione ? r.puntiRecensione : 0);
}

/** Il kit si consegna a lavoro finito (posa in corso o fatta). */
export const STATI_KIT = ["POSA", "LAVORI_ESEGUITI", "CHIUSA"];
export const puoConsegnareKit = (statoCommessa: string) => STATI_KIT.includes(statoCommessa);

export type ConsegnaMin = { utenteId: string; utenteNome: string; consegnatoIl: Date; punti: number; conFoto: boolean; recensione: boolean };
export type Posizione = { utenteId: string; nome: string; kit: number; punti: number; foto: number; recensioni: number; posizione: number };

/** Periodo di Roma «AAAA-MM» o «AAAA» di una data. */
export function periodoDi(d: Date, tipo: "mese" | "anno"): string {
  const s = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // AAAA-MM-GG
  return tipo === "mese" ? s.slice(0, 7) : s.slice(0, 4);
}

/** Classifica del periodo: più punti, poi più kit, poi nome. Pari punti e kit → stessa posizione. */
export function classifica(consegne: ConsegnaMin[], periodo: string): Posizione[] {
  const tipo = periodo.length === 4 ? "anno" : "mese";
  const per = new Map<string, Posizione>();
  for (const c of consegne) {
    if (periodoDi(c.consegnatoIl, tipo) !== periodo) continue;
    const p = per.get(c.utenteId) ?? { utenteId: c.utenteId, nome: c.utenteNome, kit: 0, punti: 0, foto: 0, recensioni: 0, posizione: 0 };
    p.kit++; p.punti += c.punti; if (c.conFoto) p.foto++; if (c.recensione) p.recensioni++;
    per.set(c.utenteId, p);
  }
  const lista = [...per.values()].sort((a, b) => b.punti - a.punti || b.kit - a.kit || a.nome.localeCompare(b.nome, "it"));
  lista.forEach((p, i) => {
    const prima = lista[i - 1];
    p.posizione = prima && prima.punti === p.punti && prima.kit === p.kit ? prima.posizione : i + 1;
  });
  return lista;
}

/** Pratiche a lavoro finito ancora senza kit consegnato (le più vecchie prima). */
export function kitDaConsegnare<T extends { id: string; stato: string; dataFine: Date | null }>(commesse: T[], conKit: Set<string>): T[] {
  return commesse
    .filter((c) => puoConsegnareKit(c.stato) && !conKit.has(c.id))
    .sort((a, b) => (a.dataFine?.getTime() ?? 0) - (b.dataFine?.getTime() ?? 0));
}
