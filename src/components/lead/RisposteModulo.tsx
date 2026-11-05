import { leggiNoteLead } from "@/lib/automazioni/note-lead";

/** Note di un lead (risposte del modulo Meta/sito e note del centralino) come elenco puntato leggibile. */
export default function RisposteModulo({ note, titoli = true }: { note: string | null | undefined; titoli?: boolean }) {
  const n = leggiNoteLead(note);
  if (!n.risposte.length && !n.altro.length && !n.noteDatate.length) return null;
  return (
    <div className="space-y-2">
      {(n.risposte.length > 0 || n.altro.length > 0) && (
        <div>
          {titoli && <p className="mb-1 text-xs font-bold uppercase text-neutral-600">Risposte del modulo</p>}
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">
            {n.risposte.map((r, i) => (
              <li key={i}><span className="font-semibold text-neutral-900">{r.domanda}:</span> {r.link ? <a href={r.risposta} target="_blank" rel="noreferrer" className="text-blue-800 underline">apri</a> : r.risposta}</li>
            ))}
            {n.altro.map((a, i) => <li key={`a${i}`}>{a}</li>)}
          </ul>
        </div>
      )}
      {n.noteDatate.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-neutral-600">Note del centralino</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">
            {n.noteDatate.map((x, i) => <li key={i}><span className="font-semibold text-neutral-900">{x.data}{x.autore ? ` · ${x.autore}` : ""}:</span> {x.testo}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
