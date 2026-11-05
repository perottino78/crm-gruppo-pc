// Note di un lead in forma leggibile: provenienza (es. «Meta Lead Ads», campagna), risposte del modulo come elenco
// («Città: Milano», «Quale prodotto le interessa?: vetrate») e note scritte dal centralino («[03/11/2026 Cristina Rege] …»).
// Le note arrivano come una riga sola con « · » (Meta, form del sito) più righe aggiunte dopo ogni esito.
// Funzioni pure, testate in tests/automazioni/note-lead.test.ts.

export type NoteLead = {
  fonte: string | null;
  campagna: string | null;
  risposte: { domanda: string; risposta: string; link?: boolean }[];
  noteDatate: { data: string; autore: string | null; testo: string }[];
  altro: string[];
};

const NOMI: Record<string, string> = {
  city: "Città", citta: "Città", comune: "Comune", post_code: "CAP", postal_code: "CAP", zip_code: "CAP", zip: "CAP", cap: "CAP",
  state: "Provincia", province: "Provincia", provincia: "Provincia", street_address: "Indirizzo", indirizzo: "Indirizzo",
  inbox_url: "Conversazione su Meta", messaggio: "Messaggio", interesse: "Interesse",
};
const FONTI = /^(Meta Lead Ads|Facebook|Instagram|Google( Ads)?|Sito( web)?|Simulatore.*|Zapier|Form .*)$/i;

/** «quale_prodotto_le_interessa?» → «Quale prodotto le interessa?» */
export function domandaLeggibile(k: string): string {
  const pulita = k.trim();
  const nota = NOMI[pulita.toLowerCase().replace(/\?$/, "")];
  if (nota) return nota;
  const t = pulita.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : pulita;
}

export function leggiNoteLead(note: string | null | undefined): NoteLead {
  const out: NoteLead = { fonte: null, campagna: null, risposte: [], noteDatate: [], altro: [] };
  for (const riga of (note ?? "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean)) {
    const datata = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+([^\]]+))?\]\s*(.*)$/.exec(riga);
    if (datata) { out.noteDatate.push({ data: datata[1], autore: datata[2]?.trim() || null, testo: datata[3].trim() }); continue; }
    for (const pezzo of riga.split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean)) {
      const kv = /^([^:]{1,90}?\??)\s*:\s+([\s\S]+)$/.exec(pezzo);
      // «https://…» da solo non è una domanda: il «:» del link non va scambiato per la separazione
      if (kv && !/^https?$/i.test(kv[1].trim())) {
        const domanda = kv[1].trim(), risposta = kv[2].trim();
        if (/^campagna$/i.test(domanda)) { out.campagna = risposta; continue; }
        out.risposte.push({ domanda: domandaLeggibile(domanda), risposta, ...(/^https?:\/\//i.test(risposta) ? { link: true } : {}) });
      } else if (!out.fonte && FONTI.test(pezzo)) out.fonte = pezzo;
      else out.altro.push(pezzo);
    }
  }
  return out;
}

/** «Arrivato dom 01/11, 21:57 da FACEBOOK (campagna CONTATTI)»: la provenienza in una riga. */
export function provenienzaLead(fonte: string | null | undefined, note: NoteLead): string {
  const da = [note.fonte, fonte && !(note.fonte ?? "").toLowerCase().includes(fonte.toLowerCase()) ? fonte : null].filter(Boolean).join(" · ");
  return [da && `da ${da}`, note.campagna && `(campagna ${note.campagna})`].filter(Boolean).join(" ");
}
