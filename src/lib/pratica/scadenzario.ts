// Stato mostrato per ogni rata dello scadenzario della pratica (come BConsole: Pagata, Parziale, Fatturata, Previsionale…). Modulo puro.

export function statoRiga(d: { pagata: boolean; parziale: boolean; etichetta: string | null; haFattura: boolean; scadenza: Date | null; adesso: Date }): { testo: string; classe: string; scaduta: boolean } {
  if (d.pagata) return { testo: "Pagata", classe: "bg-green-100 text-green-900", scaduta: false };
  const scaduta = !!d.scadenza && d.scadenza.getTime() < d.adesso.getTime() - 86400000;
  if (d.parziale) return { testo: "Parziale", classe: "bg-amber-100 text-amber-900", scaduta };
  if (d.etichetta) return { testo: d.etichetta, classe: "bg-purple-100 text-purple-900", scaduta };
  if (d.haFattura) return { testo: "Fatturata", classe: "bg-blue-100 text-blue-900", scaduta };
  return { testo: "Previsionale", classe: "bg-purple-100 text-purple-900", scaduta };
}
