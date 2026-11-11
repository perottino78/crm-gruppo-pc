// Cronologia del lead (richiesta di Rocco): il titolo di ogni voce dice subito cos'è successo («Non risponde», «Appuntamento
// fissato a CASA», «Appuntamento annullato»…) e sotto, solo se ci sono, i dettagli (data, venditore, note). Funzione pura.
import { ESITI } from "@/lib/automazioni/percorsi";

const NOMI_ESITI = Object.values(ESITI).map((e) => e.nome).sort((a, b) => b.length - a.length);
// esiti scritti da altre parti del CRM (calendario, import) con parole loro
const ALTRI: [RegExp, string][] = [
  [/^Annullato\b/i, "Appuntamento annullato"],
  [/^Da rifissare\b/i, "Appuntamento da rifissare"],
];

const pulisci = (s: string) => s.replace(/^[\s—–\-·:,]+/, "").trim();

/** Titolo e corpo di una voce «esito»: il nome dell'esito diventa il titolo, il resto (se c'è) il corpo. */
export function voceEsito(testo: string): { titolo: string; corpo: string | null } {
  const t = testo.trim();
  const nome = NOMI_ESITI.find((n) => t.toLowerCase().startsWith(n.toLowerCase()));
  if (nome) {
    const corpo = pulisci(t.slice(nome.length));
    return { titolo: nome, corpo: corpo || null };
  }
  for (const [re, titolo] of ALTRI) if (re.test(t)) {
    const corpo = pulisci(t.replace(re, ""));
    return { titolo, corpo: corpo || null };
  }
  // testo libero: la prima parte fa da titolo
  const m = t.match(/^([^\n]{2,60}?)\s+(?:—|·)\s+([\s\S]+)$/);
  return m ? { titolo: m[1], corpo: m[2] } : { titolo: t || "Esito", corpo: null };
}
