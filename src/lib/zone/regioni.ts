// Regioni italiane e sigle delle province: servono alle zone commerciali (Piemonte, Liguria, Valle d'Aosta, Lombardia…)
// per riconoscere la zona di un cliente dalla sua provincia. Funzioni pure, testate in tests/permessi/permessi.test.ts.

export const REGIONI: Record<string, string[]> = {
  "Piemonte": ["TO", "AL", "AT", "BI", "CN", "NO", "VB", "VC"],
  "Valle d'Aosta": ["AO"],
  "Lombardia": ["MI", "BG", "BS", "CO", "CR", "LC", "LO", "MN", "MB", "PV", "SO", "VA"],
  "Liguria": ["GE", "IM", "SP", "SV"],
  "Trentino-Alto Adige": ["TN", "BZ"],
  "Veneto": ["VE", "BL", "PD", "RO", "TV", "VR", "VI"],
  "Friuli-Venezia Giulia": ["TS", "GO", "PN", "UD"],
  "Emilia-Romagna": ["BO", "FC", "FE", "MO", "PR", "PC", "RA", "RE", "RN"],
  "Toscana": ["FI", "AR", "GR", "LI", "LU", "MS", "PI", "PT", "PO", "SI"],
  "Umbria": ["PG", "TR"],
  "Marche": ["AN", "AP", "FM", "MC", "PU"],
  "Lazio": ["RM", "FR", "LT", "RI", "VT"],
  "Abruzzo": ["AQ", "CH", "PE", "TE"],
  "Molise": ["CB", "IS"],
  "Campania": ["NA", "AV", "BN", "CE", "SA"],
  "Puglia": ["BA", "BT", "BR", "FG", "LE", "TA"],
  "Basilicata": ["PZ", "MT"],
  "Calabria": ["CZ", "CS", "KR", "RC", "VV"],
  "Sicilia": ["PA", "AG", "CL", "CT", "EN", "ME", "RG", "SR", "TP"],
  "Sardegna": ["CA", "NU", "OR", "SS", "SU"],
};

/** Le quattro zone di partenza (si possono aggiungere altre regioni o zone da Impostazioni › Zone commerciali). */
export const ZONE_INIZIALI = ["Piemonte", "Liguria", "Valle d'Aosta", "Lombardia"];

const NOMI_PROVINCE: Record<string, string> = {
  TORINO: "TO", ALESSANDRIA: "AL", ASTI: "AT", BIELLA: "BI", CUNEO: "CN", NOVARA: "NO", "VERBANO-CUSIO-OSSOLA": "VB", VERBANIA: "VB", VERCELLI: "VC",
  AOSTA: "AO", MILANO: "MI", BERGAMO: "BG", BRESCIA: "BS", COMO: "CO", CREMONA: "CR", LECCO: "LC", LODI: "LO", MANTOVA: "MN", "MONZA E BRIANZA": "MB", MONZA: "MB",
  PAVIA: "PV", SONDRIO: "SO", VARESE: "VA", GENOVA: "GE", IMPERIA: "IM", "LA SPEZIA": "SP", SAVONA: "SV",
};

/** Sigla della provincia da come è scritta nell'anagrafica ("TO", "to", "Torino", "(TO)"); null se non si riconosce. */
export function siglaProvincia(p: string | null | undefined): string | null {
  const t = (p ?? "").toUpperCase().replace(/[().]/g, "").trim();
  if (!t) return null;
  if (/^[A-Z]{2}$/.test(t)) return Object.values(REGIONI).some((l) => l.includes(t)) ? t : null;
  return NOMI_PROVINCE[t] ?? null;
}

/** Regione di una provincia (sigla o nome). */
export function regioneDi(p: string | null | undefined): string | null {
  const s = siglaProvincia(p);
  if (!s) return null;
  return Object.entries(REGIONI).find(([, l]) => l.includes(s))?.[0] ?? null;
}

/** Tutte le sigle di provincia di un elenco di regioni, più le province aggiunte a mano. */
export function provinceDi(regioni: string[], extra: string[] = []): string[] {
  const out = new Set<string>();
  for (const r of regioni) for (const p of REGIONI[r] ?? []) out.add(p);
  for (const p of extra) { const s = siglaProvincia(p); if (s) out.add(s); }
  return [...out].sort();
}

/** Come cercare i clienti di quelle province nel database (sigla o nome, maiuscole o minuscole). */
export function varianti(province: string[]): string[] {
  const nomi = Object.entries(NOMI_PROVINCE).filter(([, s]) => province.includes(s)).map(([n]) => n);
  return [...new Set([...province, ...province.map((p) => p.toLowerCase()), ...nomi, ...nomi.map((n) => n.charAt(0) + n.slice(1).toLowerCase())])];
}
