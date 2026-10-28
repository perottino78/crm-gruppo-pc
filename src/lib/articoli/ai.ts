// Aiuto AI per l'anagrafica articoli (Claude di Anthropic, chiamata HTTP diretta, nessuna libreria).
// Serve la variabile ANTHROPIC_API_KEY su Vercel; il modello si può cambiare con ANTHROPIC_MODEL.
// Tre usi: leggere un listino (PDF, foto o foglio disordinato) e trasformarlo nella tabella del modello,
// controllare un'importazione prima di confermarla, proporre descrizione e categoria da una foto.

export const MODELLO_AI = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const aiDisponibile = () => !!process.env.ANTHROPIC_API_KEY;

type Blocco =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export class ErroreAi extends Error {}

/** Chiamata a Claude: restituisce il testo della risposta. */
export async function chiediClaude(opz: { sistema: string; contenuto: Blocco[]; maxTokens?: number; fetchFn?: typeof fetch }): Promise<string> {
  const chiave = process.env.ANTHROPIC_API_KEY;
  if (!chiave) throw new ErroreAi("L'aiuto AI non è ancora attivo: manca la chiave ANTHROPIC_API_KEY nelle impostazioni di Vercel.");
  const f = opz.fetchFn ?? fetch;
  let r: Response;
  try {
    r = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chiave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELLO_AI(), max_tokens: opz.maxTokens ?? 4000, system: opz.sistema, messages: [{ role: "user", content: opz.contenuto }] }),
    });
  } catch {
    throw new ErroreAi("Il servizio AI non risponde: riprova tra poco.");
  }
  const j = (await r.json().catch(() => null)) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { type?: string; message?: string } } | null;
  if (!r.ok) {
    const t = j?.error?.type ?? "";
    if (r.status === 401) throw new ErroreAi("La chiave AI non è valida: controlla ANTHROPIC_API_KEY su Vercel.");
    if (r.status === 429 || t === "rate_limit_error") throw new ErroreAi("Troppe richieste all'AI in poco tempo: riprova tra un minuto.");
    if (r.status === 413 || /too large|exceed/i.test(j?.error?.message ?? "")) throw new ErroreAi("File troppo grande per l'AI: dividi il listino in parti più piccole (es. 20-30 pagine).");
    if (/credit|billing/i.test(j?.error?.message ?? "")) throw new ErroreAi("Credito AI esaurito: ricarica il credito sulla console di Anthropic.");
    throw new ErroreAi(`Errore del servizio AI (${r.status}): ${j?.error?.message ?? "risposta non valida"}`);
  }
  const testo = (j?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
  if (!testo) throw new ErroreAi("L'AI non ha restituito nulla: riprova.");
  if (j?.stop_reason === "max_tokens") return testo + "\n#TRONCATO";
  return testo;
}

/** Blocchi per i file caricati: PDF come documento, immagini come immagine, fogli come testo CSV. */
export function bloccoFile(nome: string, mime: string, dati: Buffer): Blocco {
  if (mime === "application/pdf" || /\.pdf$/i.test(nome)) return { type: "document", source: { type: "base64", media_type: "application/pdf", data: dati.toString("base64") } };
  const img = /^image\/(jpeg|png|gif|webp)$/.test(mime) ? mime : /\.png$/i.test(nome) ? "image/png" : /\.webp$/i.test(nome) ? "image/webp" : /\.(jpe?g)$/i.test(nome) ? "image/jpeg" : null;
  if (img) return { type: "image", source: { type: "base64", media_type: img, data: dati.toString("base64") } };
  throw new ErroreAi(`«${nome}»: l'AI legge PDF e foto (JPG, PNG, WEBP); i fogli Excel/CSV si caricano con «Importa».`);
}

export const INTESTAZIONE_AI = ["CODICE FORNITORE", "DESCRIZIONE", "CATEGORIA", "SOTTOCATEGORIA", "MARCA", "UM", "PREZZO LISTINO", "SCONTI", "COSTO NETTO", "NOTE"];

export function promptListino(categorie: string[], nota: string): string {
  return `Sei l'assistente acquisti di Gruppo P&C (serramenti, pergole, tende, fotovoltaico, climatizzazione, depurazione acqua).
Ricevi il listino prezzi di un fornitore (PDF, foto o tabella) e lo trasformi in una tabella CSV per l'importazione nel gestionale.

Regole:
- Rispondi SOLO con il CSV dentro un blocco \`\`\`csv … \`\`\`, nient'altro prima o dopo.
- Separatore punto e virgola. Prima riga esattamente: ${INTESTAZIONE_AI.join(";")}
- Una riga per ogni articolo con prezzo. Ignora intestazioni di pagina, totali, condizioni di vendita.
- Numeri con la virgola decimale e SENZA separatore delle migliaia (es. 1234,50). Niente simbolo €.
- PREZZO LISTINO = prezzo di listino IVA esclusa prima degli sconti. Se il documento mostra solo un prezzo netto già scontato, lascia vuoto PREZZO LISTINO e metti il valore in COSTO NETTO.
- SCONTI solo se il documento indica sconti per quell'articolo, nel formato 50+10. Altrimenti vuoto.
- Se un prezzo è IVA inclusa, scorporala (22% se non indicato) e scrivilo nelle NOTE ("scorporata IVA").
- Se un articolo ha varianti (misure, colori) con prezzi diversi, fai una riga per variante con la variante nella DESCRIZIONE.
- DESCRIZIONE chiara in italiano, max 120 caratteri, completa di misura/colore/modello se presenti.
- UM: pz, m, m², kg, conf, kit, set (vuoto = pz).
- CATEGORIA e SOTTOCATEGORIA: usa preferibilmente una di queste già esistenti: ${categorie.length ? categorie.join(" | ") : "(nessuna ancora)"}. Se nessuna va bene proponine una breve e generica.
- Racchiudi tra virgolette i campi che contengono punto e virgola.
- Non inventare codici o prezzi: se un dato non si legge lascia vuoto e scrivi "da verificare" nelle NOTE.
${nota ? `\nIndicazioni dell'utente: ${nota}` : ""}`;
}

export const PROMPT_CONTROLLO = `Sei il controllore prezzi di Gruppo P&C. Ricevi l'anteprima di un'importazione di listino (una riga per articolo con costo, prezzo di vendita, margine e categoria).
Cerca SOLO problemi concreti: prezzi palesemente sbagliati (virgola spostata, ×10, ×100), costi uguali a zero, margini anomali rispetto agli articoli simili, descrizioni incoerenti con la categoria, doppioni con descrizione quasi uguale, unità di misura sospette.
Rispondi in italiano, breve e operativo: un elenco puntato, ogni punto inizia con "Riga N:" (il numero di riga indicato) e dice cosa controllare. Massimo 25 punti, i più importanti prima.
Se non trovi nulla di rilevante rispondi solo: "Nessun problema evidente."`;

export function promptFoto(categorie: string[]): string {
  return `Sei l'assistente catalogo di Gruppo P&C (serramenti, pergole, tende, zanzariere, tapparelle, fotovoltaico, climatizzazione, depurazione acqua).
Guardi la foto di un prodotto (o della sua etichetta/confezione) e proponi i dati per la scheda articolo.
Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con queste chiavi:
{"descrizione": "max 100 caratteri, in italiano", "descrizioneEstesa": "caratteristiche visibili o leggibili, max 400 caratteri", "categoria": "...", "sottocategoria": "... o stringa vuota", "marca": "... o stringa vuota", "codiceFornitore": "codice leggibile sull'etichetta o stringa vuota", "ean": "codice a barre se leggibile o stringa vuota", "um": "pz", "note": "cosa non sei riuscito a capire"}
Per categoria e sottocategoria usa se possibile una di queste: ${categorie.length ? categorie.join(" | ") : "(nessuna ancora)"}.
Non inventare marca, codici o misure che non si vedono.`;
}

/** Estrae il CSV dalla risposta (con o senza blocco ```csv). */
export function estraiCsv(testo: string): { csv: string; troncato: boolean } {
  const troncato = /#TRONCATO$/.test(testo);
  const t = testo.replace(/#TRONCATO$/, "");
  const m = t.match(/```(?:csv)?\s*\n([\s\S]*?)(?:```|$)/);
  let csv = (m ? m[1] : t).trim();
  if (troncato) csv = csv.split(/\r?\n/).slice(0, -1).join("\n"); // l'ultima riga può essere a metà
  return { csv, troncato };
}

/** Estrae l'oggetto JSON dalla risposta. */
export function estraiJson<T>(testo: string): T | null {
  const m = testo.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}
