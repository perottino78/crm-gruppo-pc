"use client";

// Scelta del giorno «come un sito di prenotazioni» (richiesta di Rocco): sotto ogni giorno, invece del prezzo, quanti impegni
// ha già la persona scelta. Toccando un giorno si cambia la data dell'appuntamento (l'ora resta quella scritta).
import { aggiungiGiorni, lunediDi } from "@/lib/calendario/tempo";

const SETT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export default function GiorniOccupati({ giorno, oggi, conteggi, nome, onScegli }: {
  giorno: string; oggi: string; conteggi: Record<string, number>; nome: string; onScegli: (g: string) => void;
}) {
  const inizio = lunediDi(giorno < oggi ? oggi : giorno);
  const giorni = Array.from({ length: 21 }, (_, i) => aggiungiGiorni(inizio, i));
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-2">
      <p className="mb-1 text-[11px] text-neutral-600">Impegni già fissati di <b>{nome}</b> (tocca un giorno per sceglierlo):</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {SETT.map((s) => <span key={s} className="text-[10px] font-bold uppercase text-neutral-500">{s}</span>)}
        {giorni.map((g) => {
          const n = conteggi[g] ?? 0;
          const passato = g < oggi;
          const scelto = g === giorno;
          return (
            <button key={g} type="button" disabled={passato} onClick={() => onScegli(g)}
              className={`rounded-md border px-0.5 py-1 leading-tight ${scelto ? "border-green-600 bg-green-600 text-white" : passato ? "border-transparent text-neutral-300" : "border-neutral-200 hover:border-green-500 hover:bg-green-50"}`}>
              <span className="block text-xs font-bold">{+g.slice(8)}{+g.slice(8) === 1 || g === giorni[0] ? ` ${MESI[+g.slice(5, 7) - 1]}` : ""}</span>
              <span className={`block text-[10px] ${scelto ? "text-white" : n === 0 ? "text-green-700" : n >= 4 ? "font-bold text-red-700" : "text-amber-700"}`}>
                {passato ? "" : n === 0 ? "libero" : `${n} app.`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
