/** Scambio di commenti di un task: chi ha scritto, quando e cosa; il commento di chiusura è evidenziato. */
export default function ElencoCommenti({ commenti, vuoto = "Nessun commento ancora." }: { commenti: { id: string; utenteNome: string; testo: string; chiusura: boolean; createdAt: Date }[]; vuoto?: string }) {
  if (commenti.length === 0) return <p className="text-sm text-neutral-600">{vuoto}</p>;
  return (
    <ul className="space-y-2">
      {commenti.map((c) => (
        <li key={c.id} className={`rounded-lg border px-3 py-2 ${c.chiusura ? "border-green-300 bg-green-50" : "border-neutral-200 bg-white"}`}>
          <p className="text-[11px] text-neutral-600">
            <b className="text-neutral-900">{c.utenteNome}</b> · {c.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {c.chiusura && <span className="ml-1 font-bold text-green-800">· ✅ risposta di chiusura</span>}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-900">{c.testo}</p>
        </li>
      ))}
    </ul>
  );
}
