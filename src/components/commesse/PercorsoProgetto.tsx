// Percorso guidato del progetto (richiesta di Ugo 16/11/2026): dopo l'acconto «Crea progetto», poi i 5 passi in ordine
// (appuntamento di rilievo, rilievi, prodotti e materiale, ordini ai fornitori, arrivo in magazzino). Server component.
import Link from "next/link";
import type { PercorsoCommessa } from "@/lib/progetti/percorso-server";

const colori = { FATTO: { bordo: "#16a34a", sfondo: "#f0fdf4", icona: "✅" }, ORA: { bordo: "#2563eb", sfondo: "#eff6ff", icona: "👉" }, IN_ATTESA: { bordo: "#d4d4d4", sfondo: "#fafafa", icona: "⏳" } } as const;

export default function PercorsoProgetto({ commessaId, percorso: p, creaProgetto, confermaMateriale, ok, avviso, reportHref }: {
  commessaId: string; percorso: PercorsoCommessa; reportHref?: string | null;
  creaProgetto: (fd: FormData) => Promise<void>; confermaMateriale: (fd: FormData) => Promise<void>;
  ok?: string; avviso?: string;
}) {
  const giorno = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
  // il riquadro resta aperto solo quando c'è qualcosa da fare (creare il progetto, confermare il materiale) o un messaggio: il resto è già nel percorso in alto
  const daFare = p.fase === "DA_CREARE" || p.puoConfermare || !!ok || !!avviso;
  const fatti = p.passi.filter((x) => x.stato === "FATTO").length;
  return (
    <details id="progetto" open={daFare} className="card-fase scroll-mt-4 mb-4" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-3">
          <h2 className="mb-0">📁 Progetto</h2>
          <span className="text-xs font-bold px-3 py-1 rounded bg-violet-100 text-violet-900">{p.etichetta}</span>
          {p.fase !== "DA_CREARE" && <span className="text-xs text-neutral-500">{fatti} di {p.passi.length} passi fatti · clicca per i dettagli</span>}
        </span>
        {reportHref && <Link href={reportHref} className="btn-3d btn-3d-teal px-4 py-2 text-sm" title="Venduto, costi e margine di questo progetto">📊 Report economico</Link>}
      </summary>
      <div className="mt-3">
      {ok && <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">✅ {ok}</p>}
      {avviso && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{avviso}</p>}

      {p.fase === "DA_CREARE" && (
        <form action={creaProgetto} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-green-300 bg-green-50 px-4 py-3">
          <input type="hidden" name="commessaId" value={commessaId} />
          <p className="text-sm text-green-900 flex-1 min-w-[16rem]">💶 <b>Il cliente ha pagato.</b> Crea il progetto: dentro fissi il rilievo, carichi le misure, inserisci i prodotti e poi ordini ai fornitori.</p>
          <button className="btn-3d btn-3d-green">➕ Crea progetto</button>
        </form>
      )}
      {(p.fase === "IN_CORSO" || p.fase === "COMPLETO") && (
        <>
          <ol className="grid gap-2 md:grid-cols-5">
            {p.passi.map((s, i) => {
              const c = colori[s.stato];
              return (
                <li key={s.chiave} className="rounded-lg border-2 p-3 text-sm" style={{ borderColor: c.bordo, background: c.sfondo }}>
                  <p className="font-bold text-neutral-900">{c.icona} {i + 1} · {s.titolo}</p>
                  <p className="text-xs text-neutral-700 mt-1">{s.dettaglio}</p>
                  {s.stato === "ORA" && <a href={s.ancora} className="btn-3d btn-3d-blue text-[11px] px-2 py-1 mt-2 inline-block">Vai →</a>}
                </li>
              );
            })}
          </ol>
          {p.puoConfermare && (
            <form action={confermaMateriale} className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3">
              <input type="hidden" name="commessaId" value={commessaId} />
              <p className="text-sm text-blue-900 flex-1 min-w-[16rem]">Rilievo caricato e materiale completo. <b>Conferma</b> per passare agli ordini ai fornitori: parte il task per l&apos;ufficio ordini.</p>
              <button className="btn-3d btn-3d-blue">✅ Conferma materiale</button>
            </form>
          )}
          <p className="text-[11px] text-neutral-500 mt-2">
            {p.progettoCreatoIl ? `Progetto creato il ${giorno(p.progettoCreatoIl)}${p.progettoCreatoDaNome ? ` da ${p.progettoCreatoDaNome}` : ""}.` : "Pratica avviata prima del percorso guidato: nessun blocco."}
            {p.materialeConfermatoIl ? ` Materiale confermato il ${giorno(p.materialeConfermatoIl)}.` : ""}
          </p>
        </>
      )}
      </div>
    </details>
  );
}
